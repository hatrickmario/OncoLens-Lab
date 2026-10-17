/**
 * Excepciones declaradas a `oasdiff breaking` (ADR-26). Cada una nombra UN hallazgo exacto: proveedor, regla, operación,
 * ruta y texto. Lo que no coincide en todos los campos sigue rompiendo la CI.
 *
 * Uso como filtro: `oasdiff breaking … --format json | node scripts/ci/lib/excepcionesDeContrato.mjs <proveedor>`.
 * Falla cerrado: solo sale con 0 e imprime `DECISION_PERDONADO` si al menos un ERR coincide con una excepción y
 * ninguno queda sin declarar; en cualquier otro caso (entrada vacía, JSON inválido, ERR sin declarar) sale con 1.
 */
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Línea que el filtro imprime SOLO cuando perdona: `contracts-breaking.sh` falla cerrado si no la ve. */
export const DECISION_PERDONADO = 'excepciones-declaradas-aplicadas';
// Niveles de oasdiff que NO rompen: 0 y 1 (info) y 2 (warn). Todo lo demás, incluido un level ausente o no numérico, es ERR.
const NIVELES_QUE_NO_ROMPEN = new Set([0, 1, 2]);
const ARCHIVO_DE_EXCEPCIONES = path.resolve(import.meta.dirname, '../contracts-breaking-excepciones.json');

const esErr = (hallazgo) => !NIVELES_QUE_NO_ROMPEN.has(hallazgo.level);

/** Hallazgos de nivel ERR de `oasdiff breaking --format json` que no están declarados como excepción. */
export function errNoDeclarados(proveedor, hallazgos, excepciones) {
  return hallazgos.filter(esErr).filter((hallazgo) => !excepciones.some((excepcion) => esLaExcepcion(excepcion, proveedor, hallazgo)));
}

/** ¿Algún ERR coincide con una excepción declarada? (sin esto no hay nada que perdonar). */
export function hayErrDeclarado(proveedor, hallazgos, excepciones) {
  return hallazgos.filter(esErr).some((hallazgo) => excepciones.some((excepcion) => esLaExcepcion(excepcion, proveedor, hallazgo)));
}

function esLaExcepcion(excepcion, proveedor, hallazgo) {
  return (
    excepcion.proveedor === proveedor &&
    excepcion.regla === hallazgo.id &&
    excepcion.operacion === hallazgo.operation &&
    excepcion.ruta === hallazgo.path &&
    excepcion.texto === hallazgo.text
  );
}

/** ¿Este módulo es el programa que lanzó node? Compara rutas reales: el enlace simbólico (/var → /private/var) no engaña. */
function esElProgramaPrincipal() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (esElProgramaPrincipal()) {
  const proveedor = process.argv[2];
  if (!proveedor) {
    console.error('uso: oasdiff breaking … --format json | node excepcionesDeContrato.mjs <proveedor>');
    process.exit(2);
  }
  const hallazgos = JSON.parse(readFileSync(0, 'utf8'));
  const excepciones = JSON.parse(readFileSync(ARCHIVO_DE_EXCEPCIONES, 'utf8'));
  const restantes = errNoDeclarados(proveedor, hallazgos, excepciones);
  for (const hallazgo of restantes) console.log(`${proveedor}: ERR no declarado [${hallazgo.id}] ${hallazgo.operation} ${hallazgo.path}: ${hallazgo.text}`);
  const perdona = restantes.length === 0 && hayErrDeclarado(proveedor, hallazgos, excepciones);
  if (perdona) console.log(DECISION_PERDONADO);
  process.exit(perdona ? 0 : 1);
}
