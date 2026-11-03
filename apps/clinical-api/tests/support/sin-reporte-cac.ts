import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

/**
 * Test de arquitectura de AC-03.5 (US-098 AC-7): `clinical-api` no genera, exporta ni envía reportes a la Cuenta de
 * Alto Costo. Recorre las cadenas del contrato (rutas, `operationId`, resúmenes y descripciones) y el código de la CLI.
 */

const RAIZ_APP = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const RUTA_DEL_OPENAPI = resolve(RAIZ_APP, 'openapi.yaml');
export const RUTA_DE_LA_CLI = resolve(RAIZ_APP, 'src/cli');

/** `cac` solo como palabra (no dentro de «eficacia»), la Cuenta de Alto Costo y `high-cost`. */
const TERMINOS_DE_LA_CAC = [
  /(^|[^a-z0-9])cac([^a-z0-9]|$)/i,
  /cuenta\s+de\s+alto\s+costo/i,
  /alto[\s_-]+costo/i,
  /high[\s_-]*cost/i,
];

const mencionaLaCac = (texto: string): boolean => TERMINOS_DE_LA_CAC.some((t) => t.test(texto));

/** Todas las cadenas (claves y valores) de un documento YAML/JSON ya parseado, con su ruta de acceso. */
function cadenasDe(valor: unknown, ruta: string): { ruta: string; texto: string }[] {
  if (typeof valor === 'string') return [{ ruta, texto: valor }];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => cadenasDe(v, `${ruta}[${i}]`));
  if (valor !== null && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([clave, v]) => [
      { ruta: `${ruta}/${clave}`, texto: clave },
      ...cadenasDe(v, `${ruta}/${clave}`),
    ]);
  }
  return [];
}

/** Rutas del contrato (como `ruta/clave`) cuyo texto menciona la Cuenta de Alto Costo. Solo `paths`: operaciones y sus textos. */
export function hallazgosDelContrato(textoYaml: string): string[] {
  const spec = YAML.parse(textoYaml) as { paths?: Record<string, unknown> };
  return cadenasDe(spec.paths ?? {}, 'paths')
    .filter(({ texto }) => mencionaLaCac(texto))
    .map(({ ruta }) => ruta);
}

/** Archivos de la CLI cuyo código menciona la Cuenta de Alto Costo (comandos, acciones o textos de uso). */
export function hallazgosDeLaCli(archivos: Record<string, string>): string[] {
  return Object.entries(archivos)
    .filter(([, contenido]) => mencionaLaCac(contenido))
    .map(([nombre]) => nombre);
}

export function leerArchivosDeLaCli(): Record<string, string> {
  return Object.fromEntries(
    readdirSync(RUTA_DE_LA_CLI)
      .filter((nombre) => nombre.endsWith('.ts'))
      .map((nombre) => [nombre, readFileSync(resolve(RUTA_DE_LA_CLI, nombre), 'utf8')]),
  );
}

export const leerOpenapi = (): string => readFileSync(RUTA_DEL_OPENAPI, 'utf8');
