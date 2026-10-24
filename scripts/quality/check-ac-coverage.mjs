// `check-ac-coverage` (L1D-285, US-213 AC-9, design D3): cada AC de la historia de un change ACTIVO debe tener un test de
// aceptación tagueado. ALERTA, nunca error: el Gate 2 la trata como Mayor. Los tests sin tag no alertan.
//
//   AC de la historia  ← `backlog/features/FEAT-*.md`, sección `## US-nnn —`, líneas `- **AC-n …`
//   historia del change ← primera línea de `## Trazabilidad` de `openspec/changes/<change>/proposal.md`
//                         (`L1D-n · US-nnn[a-z] (AC-x…AC-y) · …`; el rango acota las historias partidas a/b)
//   test de aceptación ← título que contiene `[US-nnn AC-n]` (Vitest, Playwright) o `@pytest.mark.ac("US-nnn", n)`
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { esArchivoDeTest } from './archivos-de-test.mjs';
import { hallazgo } from './normalizar.mjs';

const REGLA = 'ac-sin-test-de-aceptacion';
const REGLA_SIN_HISTORIA = 'ac-historia-no-encontrada';
const CARPETAS_IGNORADAS = /^(node_modules|\.next|dist|coverage|\.venv|\.git|archive|generated|reports)$/;
const EXTENSIONES = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/;
const SEPARADOR_DE_RANGO = '(?:…|\\.\\.\\.|-)';

const LINEA_DE_HISTORIA = new RegExp(
  `^(?:L1D-\\d+\\s*·\\s*)?\\**US-(\\d+[a-z]?)\\**(?:\\s*\\(AC-(\\d+)\\s*${SEPARADOR_DE_RANGO}\\s*AC-(\\d+)\\))?`,
);
const TAG_DE_VITEST = /\[US-(\d+[a-z]?)\s+AC-(\d+)((?:\s*,\s*(?:AC-)?\d+)*)/g;
const MARCADOR_DE_PYTEST = /pytest\.mark\.ac\(\s*["']US-(\d+[a-z]?)["']\s*,\s*(\d+)/g;

/** Archivos de `directorio` que cumplen `aceptar`, sin recorrer dependencias ni salidas de build. */
function listar(raiz, directorio, aceptar) {
  const absoluto = path.join(raiz, directorio);
  if (!existsSync(absoluto)) return [];
  return readdirSync(absoluto, { withFileTypes: true }).flatMap((entrada) => {
    const relativo = path.posix.join(directorio, entrada.name);
    if (entrada.isDirectory()) return CARPETAS_IGNORADAS.test(entrada.name) ? [] : listar(raiz, relativo, aceptar);
    return aceptar(relativo) ? [relativo] : [];
  });
}

/**
 * Historia y rango de AC que declara un `proposal.md`, o null si su Trazabilidad no abre con una historia. `historia`
 * conserva la letra de las historias partidas (`US-117b`); `numero` es la historia entera (`US-117`), por si el backlog
 * mantiene una sola sección con todos los AC (`US-213` con el rango AC-8…AC-13).
 */
export function historiaDelChange(textoDelProposal) {
  const linea = textoDelProposal.split(/^## Trazabilidad\s*$/m)[1]?.split('\n').find((texto) => texto.trim() !== '');
  const coincidencia = linea ? LINEA_DE_HISTORIA.exec(linea.trim()) : null;
  if (!coincidencia) return null;
  const [, identificador, desde, hasta] = coincidencia;
  return {
    historia: `US-${identificador}`,
    numero: `US-${identificador.replace(/[a-z]$/, '')}`,
    rango: desde ? [Number(desde), Number(hasta)] : null,
  };
}

/** AC de la sección `## US-nnn[a-z] —` de las Features del backlog, o null si ninguna sección lleva ese identificador. */
function seccionDeLaHistoria(raiz, identificador) {
  for (const archivo of listar(raiz, 'backlog/features', (ruta) => /FEAT-[^/]*\.md$/.test(ruta))) {
    const cuerpo = readFileSync(path.join(raiz, archivo), 'utf8').split(new RegExp(`^## ${identificador}\\b.*$`, 'm'))[1];
    if (cuerpo === undefined) continue;
    const seccion = cuerpo.split(/^## US-\d+/m)[0];
    return [...seccion.matchAll(/^- \*\*AC-(\d+)\b/gm)].map((coincidencia) => Number(coincidencia[1]));
  }
  return null;
}

/**
 * Números de AC de la historia y el identificador de la sección que los contiene: primero la sección con la letra (`US-117b`),
 * y si el backlog no la tiene, la historia entera (`US-213`). Null si ninguna existe.
 */
export function acsDeLaHistoria(raiz, historia) {
  for (const identificador of new Set([historia.historia, historia.numero])) {
    const acs = seccionDeLaHistoria(raiz, identificador);
    if (acs !== null) return { identificador, acs };
  }
  return null;
}

/** Conjunto de `US-nnn AC-n` con test de aceptación tagueado en los tests del repositorio. */
export function acsConTest(raiz) {
  const cubiertos = new Set();
  const archivos = ['apps', 'packages', 'ci', 'scripts', 'infra', 'e2e'].flatMap((carpeta) =>
    listar(raiz, carpeta, (ruta) => EXTENSIONES.test(ruta) && esArchivoDeTest(ruta)),
  );
  for (const archivo of archivos) {
    const texto = readFileSync(path.join(raiz, archivo), 'utf8');
    for (const [, historia, primero, resto] of texto.matchAll(TAG_DE_VITEST)) {
      const todos = [primero, ...resto.split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean)];
      todos.forEach((n) => cubiertos.add(`US-${historia} AC-${n}`));
    }
    for (const [, historia, n] of texto.matchAll(MARCADOR_DE_PYTEST)) cubiertos.add(`US-${historia} AC-${n}`);
  }
  return cubiertos;
}

/** Una alerta por AC sin test de aceptación, en los changes activos de `openspec/changes/` (sin `archive/`). */
export function verificarCoberturaDeAc(raiz) {
  const carpeta = path.join(raiz, 'openspec/changes');
  if (!existsSync(carpeta)) return [];
  const cubiertos = acsConTest(raiz);
  return readdirSync(carpeta, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory() && entrada.name !== 'archive')
    .flatMap(({ name: change }) => {
      const proposal = path.join(carpeta, change, 'proposal.md');
      const historia = existsSync(proposal) ? historiaDelChange(readFileSync(proposal, 'utf8')) : null;
      if (!historia) return [];
      const seccion = acsDeLaHistoria(raiz, historia);
      const archivo = `openspec/changes/${change}/proposal.md`;
      if (seccion === null) {
        return [
          hallazgo({
            tool: 'check-ac-coverage',
            rule: REGLA_SIN_HISTORIA,
            file: archivo,
            symbol: `${historia.historia}: ninguna sección de backlog/features la contiene (change ${change})`,
            severity: 'warn',
          }),
        ];
      }
      return seccion.acs
        .filter((n) => !historia.rango || (n >= historia.rango[0] && n <= historia.rango[1]))
        .filter((n) => !cubiertos.has(`${seccion.identificador} AC-${n}`))
        .map((n) =>
          hallazgo({
            tool: 'check-ac-coverage',
            rule: REGLA,
            file: archivo,
            symbol: `${seccion.identificador} AC-${n} (change ${change})`,
            severity: 'warn',
          }),
        );
    });
}
