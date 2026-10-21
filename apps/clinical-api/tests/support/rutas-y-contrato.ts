import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Router } from 'express';
import YAML from 'yaml';
import { permisosExigidos } from '../../src/middleware/authorize.js';

/**
 * Coherencia ruta ↔ contrato (US-045 AC-3, design D2): recorre las rutas REALMENTE montadas en los routers y las
 * compara con las operaciones de `openapi.yaml`. Una ruta montada sin `authorize()` o con otros códigos que su
 * `x-permission` hace fallar el test nombrando su `operationId`.
 */

const RUTA_DEL_SPEC = resolve(fileURLToPath(new URL('../../openapi.yaml', import.meta.url)));
const METODOS = ['get', 'put', 'post', 'delete', 'patch'] as const;
const PERMISO_PUBLICO = 'publico';
/** Prefijo bajo el que `createApp` monta los routers protegidos. */
export const PREFIJO_DE_PLATAFORMA = '/platform';

export interface OperacionDelContrato {
  readonly operationId: string;
  readonly metodo: string;
  readonly ruta: string;
  readonly permisos: readonly string[];
}

export function leerOperacionesDelContrato(): OperacionDelContrato[] {
  const spec = YAML.parse(readFileSync(RUTA_DEL_SPEC, 'utf8')) as {
    paths: Record<
      string,
      Record<string, { operationId?: string; 'x-permission'?: string | string[] }>
    >;
  };
  const operaciones: OperacionDelContrato[] = [];
  for (const [ruta, item] of Object.entries(spec.paths)) {
    for (const metodo of METODOS) {
      const operacion = item[metodo];
      if (operacion?.operationId === undefined) continue;
      const permisos = [operacion['x-permission'] ?? []].flat();
      operaciones.push({ operationId: operacion.operationId, metodo, ruta, permisos });
    }
  }
  return operaciones;
}

export interface RutaMontada {
  readonly metodo: string;
  /** Ruta con el prefijo de plataforma, con parámetros `{x}` como en el contrato. */
  readonly ruta: string;
  /** `undefined` si ningún manejador de la ruta es un `authorize()`. */
  readonly permisos: readonly string[] | undefined;
  /** Parser de cuerpo (`jsonParser`...) montado ANTES de `authorize()`: el 403 debe llegar antes de leer el cuerpo. */
  readonly parserAntesDeAuthorize: string | undefined;
}

interface ManejadorDeCapa {
  name?: string;
  stack?: unknown;
}

interface CapaDeExpress {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: ManejadorDeCapa }[] };
  handle: ManejadorDeCapa;
  /** `true` en `use(fn)` sin ruta; `false` cuando se monta con una ruta (`use('/x', ...)`). */
  slash?: boolean;
}

const PARSERS_DE_CUERPO: ReadonlySet<string> = new Set([
  'jsonParser',
  'urlencodedParser',
  'rawParser',
  'textParser',
]);
const SOLO_PLANOS = 'los routers protegidos montan rutas planas';

function rutaComoContrato(rutaDeExpress: string): string {
  return `${PREFIJO_DE_PLATAFORMA}${rutaDeExpress.replace(/:(\w+)/g, '{$1}')}`;
}

function parserAntesDeAuthorize(manejadores: readonly ManejadorDeCapa[]): string | undefined {
  const posicion = manejadores.findIndex((manejador) => permisosExigidos(manejador) !== undefined);
  return manejadores
    .slice(0, Math.max(posicion, 0))
    .map((manejador) => manejador.name ?? '')
    .find((nombre) => PARSERS_DE_CUERPO.has(nombre));
}

function rutaDeLaCapa(capa: CapaDeExpress & Required<Pick<CapaDeExpress, 'route'>>): RutaMontada[] {
  const manejadores = capa.route.stack.map((c) => c.handle);
  const permisos = manejadores.map(permisosExigidos).find((codigos) => codigos !== undefined);
  return Object.keys(capa.route.methods).map((metodo) => ({
    metodo,
    ruta: rutaComoContrato(capa.route.path),
    permisos,
    parserAntesDeAuthorize: parserAntesDeAuthorize(manejadores),
  }));
}

/** Aviso de una capa que no es una ruta directa: no se puede casar con el contrato y NUNCA se omite en silencio. */
function avisoDeCapaSinRuta(capa: CapaDeExpress): string | undefined {
  if (capa.handle.stack !== undefined) return `ruta anidada no verificable: ${SOLO_PLANOS}`;
  if (capa.slash === false) return `middleware montado con ruta no verificable: ${SOLO_PLANOS}`;
  return undefined;
}

interface Recorrido {
  montadas: RutaMontada[];
  avisos: string[];
}

function recorrer(routers: readonly Router[]): Recorrido {
  const recorrido: Recorrido = { montadas: [], avisos: [] };
  for (const router of routers) {
    for (const capa of (router as unknown as { stack: CapaDeExpress[] }).stack) {
      if (capa.route !== undefined) {
        recorrido.montadas.push(...rutaDeLaCapa({ ...capa, route: capa.route }));
        continue;
      }
      const aviso = avisoDeCapaSinRuta(capa);
      if (aviso !== undefined) recorrido.avisos.push(aviso);
    }
  }
  return recorrido;
}

/** Rutas planas de los routers montados. */
export function rutasMontadas(routers: readonly Router[]): RutaMontada[] {
  return recorrer(routers).montadas;
}

export function operacionDeLaRuta(
  montada: RutaMontada,
  operaciones: readonly OperacionDelContrato[],
): OperacionDelContrato | undefined {
  return operaciones.find((op) => op.metodo === montada.metodo && op.ruta === montada.ruta);
}

const mismosCodigos = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/** Una línea por incoherencia, encabezada por el `operationId`; vacío si cada ruta montada declara su permiso. */
export function incoherencias(
  routers: readonly Router[],
  operaciones: readonly OperacionDelContrato[] = leerOperacionesDelContrato(),
): string[] {
  const recorrido = recorrer(routers);
  const problemas: string[] = [...recorrido.avisos];
  for (const montada of recorrido.montadas) {
    const operacion = operacionDeLaRuta(montada, operaciones);
    const etiqueta = `${montada.metodo.toUpperCase()} ${montada.ruta}`;
    if (operacion === undefined) {
      problemas.push(`${etiqueta}: ruta montada sin operación en openapi.yaml`);
    } else if (operacion.permisos.includes(PERMISO_PUBLICO)) {
      continue;
    } else if (montada.permisos === undefined) {
      problemas.push(`${operacion.operationId}: ruta montada sin authorize()`);
    } else if (montada.parserAntesDeAuthorize !== undefined) {
      problemas.push(
        `${operacion.operationId}: authorize() debe ir antes de cualquier parser de cuerpo (${montada.parserAntesDeAuthorize})`,
      );
    } else if (!mismosCodigos(montada.permisos, operacion.permisos)) {
      problemas.push(
        `${operacion.operationId}: authorize(${montada.permisos.join(', ')}) no coincide con x-permission [${operacion.permisos.join(', ')}]`,
      );
    }
  }
  return problemas;
}
