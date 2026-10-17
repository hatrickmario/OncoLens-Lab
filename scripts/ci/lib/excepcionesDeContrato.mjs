/**
 * Excepciones declaradas a `oasdiff breaking` (ADR-26). Cada una nombra UN hallazgo exacto: proveedor, regla, operación,
 * ruta y texto. Lo que no coincide en todos los campos sigue rompiendo la CI.
 *
 * Uso como filtro: `oasdiff breaking … --format json | node scripts/ci/lib/excepcionesDeContrato.mjs <proveedor>`
 * imprime los ERR no declarados (JSON) y sale con 1 si queda alguno.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Línea que el filtro imprime SOLO cuando perdona: `contracts-breaking.sh` falla cerrado si no la ve. */
export const DECISION_PERDONADO = 'excepciones-declaradas-aplicadas';
const NIVEL_ERR = 3;
const ARCHIVO_DE_EXCEPCIONES = path.resolve(import.meta.dirname, '../contracts-breaking-excepciones.json');

/** Hallazgos de nivel ERR de `oasdiff breaking --format json` (level 3) que no están declarados como excepción. */
export function errNoDeclarados(proveedor, hallazgos, excepciones) {
  return hallazgos
    .filter((hallazgo) => hallazgo.level === NIVEL_ERR)
    .filter((hallazgo) => !excepciones.some((excepcion) => esLaExcepcion(excepcion, proveedor, hallazgo)));
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const proveedor = process.argv[2];
  if (!proveedor) {
    console.error('uso: oasdiff breaking … --format json | node excepcionesDeContrato.mjs <proveedor>');
    process.exit(2);
  }
  const hallazgos = JSON.parse(readFileSync(0, 'utf8') || '[]');
  const excepciones = JSON.parse(readFileSync(ARCHIVO_DE_EXCEPCIONES, 'utf8'));
  const restantes = errNoDeclarados(proveedor, hallazgos, excepciones);
  for (const hallazgo of restantes) console.log(`${proveedor}: ERR no declarado [${hallazgo.id}] ${hallazgo.operation} ${hallazgo.path}: ${hallazgo.text}`);
  process.exit(restantes.length === 0 ? 0 : 1);
}
