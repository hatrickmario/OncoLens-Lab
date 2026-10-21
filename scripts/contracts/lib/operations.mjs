/** Operaciones, respuestas y cuerpos de un spec OpenAPI empaquetado. */
import { pointerOf, resolvePointer } from './pointer.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** @typedef {{ method: string, route: string, pointer: string, operation: any }} OperationEntry */
/** @typedef {{ node: any, pointer: string }} Resolved nodo resuelto y su puntero físico canónico */

/** Todas las operaciones del spec, con el puntero de cada una. @returns {OperationEntry[]} */
export function listOperations(spec) {
  const entries = [];
  for (const [route, pathItem] of Object.entries(spec?.paths ?? {})) {
    for (const method of METHODS) {
      if (pathItem?.[method]) {
        entries.push({ method, route, pointer: pointerOf('paths', route, method), operation: pathItem[method] });
      }
    }
  }
  return entries;
}

/** Todos los parámetros declarados (en las operaciones y en `components.parameters`), con su puntero. */
export function listParameters(spec) {
  const inOperations = listOperations(spec).flatMap((entry) =>
    (entry.operation.parameters ?? []).map((parameter, index) => ({ parameter, pointer: `${entry.pointer}/parameters/${index}` })),
  );
  const shared = Object.entries(spec?.components?.parameters ?? {}).map(([name, parameter]) => ({ parameter, pointer: pointerOf('components', 'parameters', name) }));
  return [...inOperations, ...shared];
}

/** La operación `METHOD /ruta`, o `undefined`. @returns {OperationEntry | undefined} */
export function findOperation(spec, method, route) {
  return listOperations(spec).find((entry) => entry.method === method.toLowerCase() && entry.route === route);
}

/** Etiqueta legible de una operación: `POST /platform/auth/login`. */
export const labelOf = (entry) => `${entry.method.toUpperCase()} ${entry.route}`;

/**
 * Respuestas de una operación, ya resueltas (las de `components.responses` incluidas).
 * @returns {(Resolved & { status: string })[]}
 */
export function listResponses(spec, entry) {
  return Object.keys(entry.operation.responses ?? {}).map((status) => ({
    status,
    ...resolvePointer(spec, `${entry.pointer}/responses/${status}`),
  }));
}

/** La respuesta `status` de la operación, o `undefined`. */
export function findResponse(spec, entry, status) {
  return listResponses(spec, entry).find((item) => item.status === String(status));
}

/** Schema JSON (`application/json`) de una respuesta o de un cuerpo de petición. @returns {Resolved | undefined} */
export function jsonSchemaOf(spec, holder) {
  if (!holder?.node?.content?.['application/json']?.schema) return undefined;
  return resolvePointer(spec, `${holder.pointer}/content/application~1json/schema`);
}

/** Cuerpo de petición de una operación. @returns {Resolved | undefined} */
export function requestBodyOf(spec, entry) {
  return resolvePointer(spec, `${entry.pointer}/requestBody`);
}

const esParametro = (segmento) => /^\{[^{}/]+\}$/.test(segmento);
const segmentosDeRuta = (ruta) => ruta.split(/[?#]/, 1)[0].split('/').filter((segmento) => segmento !== '');

/** Una plantilla (`/a/{id}/b`) admite la ruta concreta si tiene los mismos segmentos y los literales coinciden. */
function plantillaAdmite(plantilla, segmentosConcretos) {
  const segmentosPlantilla = segmentosDeRuta(plantilla);
  return (
    segmentosPlantilla.length === segmentosConcretos.length &&
    segmentosPlantilla.every((segmento, indice) => esParametro(segmento) || segmento === segmentosConcretos[indice])
  );
}

const literalesDe = (plantilla) => segmentosDeRuta(plantilla).filter((segmento) => !esParametro(segmento)).length;

/**
 * Operación del spec a la que corresponde una petición concreta (`GET /platform/patients/<id>` → `/platform/patients/{patientId}`).
 * Gana la plantilla con más segmentos literales; un empate entre plantillas distintas no se resuelve (falla cerrado).
 * @returns {OperationEntry | undefined}
 */
export function resolverOperacion(spec, method, rutaConcreta) {
  const segmentosConcretos = segmentosDeRuta(rutaConcreta);
  const candidatas = listOperations(spec).filter(
    (entry) => entry.method === method.toLowerCase() && plantillaAdmite(entry.route, segmentosConcretos),
  );
  const mejor = Math.max(0, ...candidatas.map((entry) => literalesDe(entry.route)));
  const ganadoras = candidatas.filter((entry) => literalesDe(entry.route) === mejor);
  return ganadoras.length === 1 ? ganadoras[0] : undefined;
}

/** Ruta concreta sin query y con `{…}` en todo segmento que no sea un literal del spec: un id o un valor nunca se imprime (RN-10). */
export function rutaSinValores(spec, ruta) {
  const literales = new Set(listOperations(spec).flatMap((entry) => segmentosDeRuta(entry.route).filter((segmento) => !esParametro(segmento))));
  return `/${segmentosDeRuta(ruta).map((segmento) => (literales.has(segmento) ? segmento : '{…}')).join('/')}`;
}
