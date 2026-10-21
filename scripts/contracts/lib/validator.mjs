/** Validación de ejemplos contra los specs empaquetados con Ajv (JSON Schema 2020-12, estricto). */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { jsonSchemaOf } from './operations.mjs';
import { resolvePointer } from './pointer.mjs';
import { PROVIDERS } from './specs.mjs';

/** Palabras clave de OpenAPI que Ajv estricto debe conocer aunque no validen datos. */
const OPENAPI_KEYWORDS = [
  'openapi',
  'info',
  'servers',
  'security',
  'tags',
  'paths',
  'components',
  'x-permission',
  'x-view-by-permission',
  'x-pending-owner',
  'x-open-owner',
];

function createAjv(specs) {
  // strictRequired off: un `required` dentro de un anyOf se refiere a propiedades del schema padre.
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  ajv.addFormat('binary', true);
  ajv.addKeyword({ keyword: 'discriminator', schemaType: 'object' });
  OPENAPI_KEYWORDS.forEach((keyword) => ajv.addKeyword({ keyword }));
  for (const name of PROVIDERS) {
    if (specs[name].bundled) ajv.addSchema({ $id: name, ...specs[name].bundled });
  }
  return ajv;
}

/** Puntero físico del schema JSON que valida el destino de un ejemplo (schema, cuerpo o respuesta). */
function schemaPointerOfTarget(spec, target) {
  const resolved = resolvePointer(spec, target);
  if (!resolved) return null;
  return resolved.node?.content ? (jsonSchemaOf(spec, resolved)?.pointer ?? null) : resolved.pointer;
}

/** Ruta JSON del campo incumplido; en propiedades no declaradas o ausentes incluye su nombre (nunca su valor). */
function rutaDelCampo(item) {
  const nombre = item.params?.additionalProperty ?? item.params?.unevaluatedProperty ?? item.params?.missingProperty;
  return `${item.instancePath}${nombre === undefined ? '' : `/${nombre}`}` || '#';
}

/**
 * @typedef {{ error: string } | { problems: { path: string, message: string }[] }} Verdict
 */

/**
 * Validador de ejemplos sobre los specs empaquetados.
 * @returns {{ validate: (entry: { spec: string, target: string }, data: any) => Verdict }}
 */
export function createExampleValidator(specs) {
  const ajv = createAjv(specs);
  return {
    validate(entry, data) {
      const spec = specs[entry.spec]?.bundled;
      if (!spec) return { error: `el spec ${entry.spec} no está disponible` };
      const pointer = schemaPointerOfTarget(spec, entry.target);
      if (!pointer) return { error: `el destino ${entry.target} no existe en ${entry.spec}` };
      let validate;
      try {
        validate = ajv.compile({ $ref: `${entry.spec}${pointer}` });
      } catch (error) {
        return { error: `el schema de ${entry.target} no compila: ${error.message}` };
      }
      validate(data);
      return { problems: (validate.errors ?? []).map((item) => ({ path: rutaDelCampo(item), message: `${item.message} (${item.schemaPath})` })) };
    },
  };
}
