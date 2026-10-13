/** Palabras clave de JSON Schema 2020-12 que contienen subschemas: la única lista que usan los dos recorridos. */

/** Mapas nombre → subschema. */
export const SCHEMA_MAP_KEYWORDS = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];

/** Listas de subschemas. */
export const SCHEMA_LIST_KEYWORDS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

/** Un solo subschema. */
export const SCHEMA_KEYWORDS = [
  'items',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contentSchema',
];
