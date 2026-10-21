/**
 * Verificación del proveedor [S1 resp. 17, US-214]: valida respuestas contra el spec empaquetado (`bundleSpecs()`), con la misma
 * configuración de Ajv2020 que `contracts:check`. `verificarRespuesta()` comprueba la respuesta completa (código declarado,
 * cabeceras obligatorias y cuerpo) y es lo que usan los clientes de test; `assertMatchesSpec()` valida un cuerpo contra un
 * puntero concreto (para schemas distintos del de la respuesta).
 *
 * Los mensajes nombran proveedor, método, plantilla, código y ruta JSON, nunca el valor (RN-10, RN-14): un cuerpo puede
 * llevar datos.
 */
import { getBundledSpecs } from './bundledSpecs.mjs';
import { findResponse, labelOf, listOperations, resolverOperacion } from './operations.mjs';
import { followRefs } from './pointer.mjs';
import { createExampleValidator } from './validator.mjs';

let validator;

/**
 * @param {string} provider `clinical-api` o `rag-orchestrator`
 * @param {string} pointer `#/components/schemas/<Nombre>` o `#/paths/<ruta>/<método>/responses/<código>`
 * @param {unknown} body cuerpo ya parseado
 * @returns {{ path: string, message: string }[]} vacío si el cuerpo cumple el spec
 */
export function matchesSpec(provider, pointer, body) {
  validator ??= createExampleValidator(getBundledSpecs());
  const verdict = validator.validate({ spec: provider, target: pointer }, body);
  if (verdict.error) throw new Error(verdict.error);
  return verdict.problems;
}

/** Lanza un error que nombra cada campo incumplido si el cuerpo no cumple el spec. */
export function assertMatchesSpec(provider, pointer, body) {
  const problems = matchesSpec(provider, pointer, body);
  if (problems.length > 0) {
    throw new Error(`la respuesta no cumple ${provider}${pointer}:\n${problems.map((item) => `  ${item.path}: ${item.message}`).join('\n')}`);
  }
}

/** Ruta concreta sin query y con `{…}` en todo segmento que no sea un literal del spec: un id o un valor nunca se imprime (RN-10). */
function rutaSinValores(spec, ruta) {
  const literales = new Set(listOperations(spec).flatMap((entry) => entry.route.split('/').filter((segmento) => segmento !== '' && !segmento.startsWith('{'))));
  return ruta
    .split(/[?#]/, 1)[0]
    .split('/')
    .map((segmento) => (segmento === '' || literales.has(segmento) ? segmento : '{…}'))
    .join('/');
}

/** La respuesta que el spec declara para `status`: código exacto, rango `NXX` o `default`. */
function respuestaDeclarada(spec, operacion, status) {
  const declaradas = Object.keys(operacion.operation.responses ?? {});
  const clave = [String(status), `${String(status)[0]}XX`, 'default'].find((candidata) => declaradas.includes(candidata));
  return clave === undefined ? undefined : { codigo: clave, ...findResponse(spec, operacion, clave) };
}

/** Nombres de las cabeceras que la respuesta declara con `required: true` y no llegaron. */
function cabecerasObligatoriasAusentes(spec, respuestaDelSpec, cabeceras) {
  const recibidas = new Set(Object.keys(cabeceras).map((nombre) => nombre.toLowerCase()));
  return Object.entries(respuestaDelSpec.node.headers ?? {})
    .filter(([, cabecera]) => followRefs(spec, cabecera, '#').node?.required === true)
    .map(([nombre]) => nombre)
    .filter((nombre) => !recibidas.has(nombre.toLowerCase()));
}

/** La operación del spec a la que corresponde la petición; sin ella la verificación falla cerrado (nunca se omite). */
function exigirOperacion(spec, { proveedor, metodo, ruta }) {
  const operacion = resolverOperacion(spec, metodo, ruta);
  if (!operacion) throw new Error(`${proveedor} ${metodo.toUpperCase()} ${rutaSinValores(spec, ruta)}: la operación no existe en el spec`);
  return operacion;
}

/** La respuesta que el spec declara para el status recibido; un código no declarado hace fallar la verificación. */
function exigirRespuestaDeclarada(spec, operacion, { proveedor, status }) {
  const declarada = respuestaDeclarada(spec, operacion, status);
  if (declarada) return declarada;
  const declarados = Object.keys(operacion.operation.responses ?? {}).join(', ');
  throw new Error(`${proveedor} ${labelOf(operacion)} ${status}: código no declarado (el spec declara ${declarados})`);
}

/** Incumplimientos del cuerpo: el que la respuesta no declara, el que falta, o los de su schema (ruta JSON y mensaje, sin el valor). */
function problemasDelCuerpo(validador, proveedor, declarada, cuerpo) {
  const declaraJson = declarada.node.content?.['application/json'] !== undefined;
  if (!declaraJson) return cuerpo === undefined ? [] : [{ path: '#', message: 'la respuesta no declara cuerpo' }];
  if (cuerpo === undefined) return [{ path: '#', message: 'falta el cuerpo que la respuesta declara' }];
  const veredicto = validador.validate({ spec: proveedor, target: declarada.pointer }, cuerpo);
  if (veredicto.error) throw new Error(veredicto.error);
  return veredicto.problems;
}

/**
 * Crea un verificador de respuestas sobre unos specs ya empaquetados (los de `getBundledSpecs()` o, en los tests, sintéticos).
 * @param {{ [proveedor: string]: { bundled: any } }} specs
 */
export function crearVerificadorDeRespuestas(specs) {
  const validador = createExampleValidator(specs);
  return function verificar(respuesta) {
    const { proveedor, status, cabeceras, cuerpo } = respuesta;
    const spec = specs[proveedor]?.bundled;
    if (!spec) throw new Error(`proveedor sin spec empaquetado: ${proveedor}`);
    const operacion = exigirOperacion(spec, respuesta);
    const declarada = exigirRespuestaDeclarada(spec, operacion, respuesta);
    const ausentes = cabecerasObligatoriasAusentes(spec, declarada, cabeceras).map((nombre) => ({ path: `header ${nombre}`, message: 'cabecera obligatoria ausente' }));
    const problemas = [...ausentes, ...problemasDelCuerpo(validador, proveedor, declarada, cuerpo)];
    if (problemas.length > 0) {
      throw new Error(problemas.map((item) => `la respuesta no cumple ${proveedor} ${labelOf(operacion)} ${status}: ${item.path}: ${item.message}`).join('\n'));
    }
    return { plantilla: operacion.route, codigo: declarada.codigo };
  };
}

let verificadorGlobal;

/**
 * Verifica una respuesta HTTP completa contra el spec empaquetado del proveedor y devuelve la operación y el código contra los que se verificó.
 * Lanza si la operación o el código no existen en el spec, falta una cabecera obligatoria o el cuerpo incumple el schema.
 * @param {{ proveedor: string, metodo: string, ruta: string, status: number, cabeceras: Record<string, unknown>, cuerpo: unknown }} respuesta
 * @returns {{ plantilla: string, codigo: string }}
 */
export function verificarRespuesta(respuesta) {
  verificadorGlobal ??= crearVerificadorDeRespuestas(getBundledSpecs());
  return verificadorGlobal(respuesta);
}
