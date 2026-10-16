#!/usr/bin/env node
/**
 * AC-4 de US-036: escáner de PII sobre todo lo que lista `git ls-files` (RN-13, RN-14, RN-22).
 * Los formatos salen de `config/pii-formats.json` (fuente única); las exclusiones, de una lista cerrada; lo demás solo
 * se omite por la allowlist, por fixture y por valor (hash del valor normalizado, sin PII en claro).
 * Nunca imprime el valor detectado: el log de la CI de un repositorio público es público.
 * Uso: node scripts/ci/pii-scan.mjs [--root <dir>] [--hash]
 *   --hash  añade el sha256 del valor normalizado a cada hallazgo, para poblar la allowlist con valores sintéticos.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { esTexto, leerBytes, listarArchivosVersionados } from './lib/archivos.mjs';
import { leerConfiguracion, parametros } from './lib/cli.mjs';
import { esMarcaSintetica } from './lib/claseDatos.mjs';
import { casaConGlob, validarGlob } from './lib/glob.mjs';
import { coincidenciasPii, compilarFormatos } from '../lib/formatosPii.mjs';

/** Lista cerrada de exclusiones admisibles: lockfiles y binarios por extensión. En código, para que la configuración no pueda ampliarla. */
export const EXCLUSIONES_PERMITIDAS = [
  '**/package-lock.json',
  '**/*.lock',
  'ci/tools.lock',
  '**/*.{png,jpg,jpeg,gif,ico,webp,pdf,woff,woff2,ttf,zip,gz}',
];

/** Segmentos de ruta que no identifican un fixture: un glob que solo se apoya en ellos es más amplio que un directorio de fixture. */
export const DIRECTORIOS_GENERICOS = [
  'apps', 'clinical-api', 'rag-orchestrator', 'web', 'test', 'tests', 'prisma', 'openspec', 'changes', 'specs',
  'backlog', 'features', 'data', 'docs', 'ci', 'cases', 'contracts', 'examples', 'eval', 'reports',
];

const SOLO_EXTENSION = /^\*+\.[a-z0-9]+$/i;
const MINIMO_DE_LETRAS_PROPIAS = 4;

/** ¿Algún segmento del glob es un literal propio de un fixture (ni genérico, ni comodín, ni solo una extensión)? */
function tieneSegmentoPropio(glob) {
  return glob.split('/').some((segmento) => {
    if (DIRECTORIOS_GENERICOS.includes(segmento) || SOLO_EXTENSION.test(segmento)) return false;
    const literal = segmento.replace(/[*?{}]/g, '');
    return literal.replace(/[^\p{L}\p{N}]/gu, '').length >= MINIMO_DE_LETRAS_PROPIAS;
  });
}

/** Un glob más amplio que un directorio de fixture: `*`/`**` en el primer segmento o sin ningún segmento propio. */
export function globMasAmplioQueUnFixture(glob) {
  const primero = glob.split('/')[0];
  return /^\*+$/.test(primero) || !tieneSegmentoPropio(glob);
}

/** Errores de las exclusiones de `config/pii-scan.json`: cada una es idéntica a un patrón de la lista cerrada y trae motivo. */
export function validarExclusiones(excluir) {
  return excluir.flatMap((exclusion) => {
    const errores = [];
    if (!EXCLUSIONES_PERMITIDAS.includes(exclusion.patron)) {
      errores.push(`exclusión no permitida: ${exclusion.patron} (solo lockfiles y binarios de la lista cerrada)`);
    }
    if (!exclusion.motivo) errores.push(`exclusión sin motivo: ${exclusion.patron}`);
    return errores;
  });
}

/** Errores de la allowlist: cada entrada es de un fixture sintético, con valores, con rutas y sin globs amplios. */
export function validarAllowlist(allowlist) {
  return allowlist.flatMap((entrada) => {
    const nombre = entrada.fixture ?? '(sin fixture)';
    const errores = [];
    if (!esMarcaSintetica(entrada)) errores.push(`entrada de la allowlist ${nombre}: sin clase sintetico`);
    if (!Array.isArray(entrada.valores) || entrada.valores.length === 0) errores.push(`entrada de la allowlist ${nombre}: sin valores`);
    if (!Array.isArray(entrada.rutas) || entrada.rutas.length === 0) {
      errores.push(`entrada de la allowlist ${nombre}: sin rutas`);
    } else {
      for (const glob of entrada.rutas) {
        const invalido = validarGlob(glob);
        if (invalido) errores.push(`entrada de la allowlist ${nombre}: glob inválido (${glob}): ${invalido}`);
        else if (globMasAmplioQueUnFixture(glob)) errores.push(`entrada de la allowlist ${nombre}: glob más amplio que un directorio de fixture (${glob})`);
      }
    }
    return errores;
  });
}

/** Forma comparable del valor, según el tipo del formato: es lo que se hashea. */
export function normalizarValor(formato, valor) {
  if (formato.tipo === 'correo') return valor.replace(/\s+/g, '').toLowerCase();
  if (formato.tipo === 'telefono') return `${valor.trim().startsWith('+') ? '+' : ''}${valor.replace(/\D/g, '')}`;
  return valor.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
}

const sha256 = (texto) => createHash('sha256').update(texto).digest('hex');

/** ¿El hallazgo está cubierto por una entrada: ruta que casa con un glob y (formato, hash) en los valores de esa misma entrada? */
export function estaEnAllowlistSintetica(ruta, formato, hash, allowlist) {
  return allowlist.some(
    (entrada) =>
      entrada.rutas.some((glob) => casaConGlob(ruta, glob)) &&
      entrada.valores.some((valor) => valor.formato === formato && valor.sha256 === hash),
  );
}

/**
 * PII en un texto. Devuelve la línea, el formato y el hash del valor normalizado; el valor en claro no sale de aquí.
 * @param {string} texto
 * @param {ReturnType<typeof compilarFormatos>} formatos formatos compilados de scripts/lib/formatosPii.mjs
 * @returns {{ linea: number, formato: string, sha256: string }[]}
 */
export function detectarPii(texto, formatos) {
  return texto.split('\n').flatMap((contenido, indice) =>
    coincidenciasPii(contenido, formatos).map(({ formato, valor }) => ({
      linea: indice + 1,
      formato: formato.id,
      sha256: sha256(normalizarValor(formato, valor)),
    })),
  );
}

/** Ejecuta el escaneo y devuelve las líneas del informe y los problemas de configuración. */
export function escanear({ archivos, leer, formatos, excluir, allowlist }) {
  const problemas = [...validarExclusiones(excluir), ...validarAllowlist(allowlist)];
  const allowlistUsable = allowlist.filter((entrada) => (entrada.rutas ?? []).every((glob) => validarGlob(glob) === null));
  const patronesExcluidos = excluir.map((exclusion) => exclusion.patron).filter((patron) => EXCLUSIONES_PERMITIDAS.includes(patron));
  const hallazgos = [];
  const noEscaneados = [];
  for (const ruta of archivos) {
    if (patronesExcluidos.some((patron) => casaConGlob(ruta, patron))) continue;
    const bytes = leer(ruta);
    if (bytes === null) continue;
    if (!esTexto(bytes)) {
      noEscaneados.push(ruta);
      continue;
    }
    detectarPii(bytes.toString('utf8'), formatos)
      .filter((hallazgo) => !estaEnAllowlistSintetica(ruta, hallazgo.formato, hallazgo.sha256, allowlistUsable))
      .forEach((hallazgo) => hallazgos.push({ ruta, ...hallazgo }));
  }
  return { problemas, hallazgos, noEscaneados };
}

function main() {
  const { raiz, banderas } = parametros(process.argv.slice(2), '');
  if (banderas.has('--hash')) console.error('aviso: el sha256 no protege el valor (un número corto se invierte por fuerza bruta), solo lo identifica; úsalo únicamente con valores sintéticos');
  const formatos = compilarFormatos(leerConfiguracion(raiz, 'config/pii-formats.json'));
  const { excluir } = leerConfiguracion(raiz, 'config/pii-scan.json');
  const allowlist = leerConfiguracion(raiz, 'config/pii-allowlist.json');
  const { problemas, hallazgos, noEscaneados } = escanear({
    archivos: listarArchivosVersionados(raiz),
    leer: (ruta) => leerBytes(raiz, ruta),
    formatos,
    excluir,
    allowlist,
  });
  noEscaneados.forEach((ruta) => console.log(`no escaneado (binario): ${ruta}`));
  problemas.forEach((problema) => console.error(`pii-scan — configuración inválida: ${problema}`));
  hallazgos.forEach((h) => console.error(`${h.ruta}:${h.linea}: ${h.formato}${banderas.has('--hash') ? ` sha256=${h.sha256}` : ''}`));
  if (problemas.length === 0 && hallazgos.length === 0) console.log('pii-scan — sin PII en los archivos versionados');
  return problemas.length === 0 && hallazgos.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
