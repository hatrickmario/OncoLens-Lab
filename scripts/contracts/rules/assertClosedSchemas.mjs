/**
 * AC-1 [Pre-S1 resp. 25]: todo schema object declara required y additionalProperties false (o
 * unevaluatedProperties false en las composiciones) y todo enum nullable incluye null.
 */
import { reporter } from '../lib/findings.mjs';
import { allSchemas } from '../lib/walk.mjs';
import { EVIDENCE, PROVIDERS } from '../lib/specs.mjs';

const report = reporter('assertClosedSchemas', 'AC-1');

/** Excepciones nombradas, cada una con su dueño (design.md D7). */
const OPEN_BY_DESIGN = [
  '#/components/schemas/CitedSourceFields', // auxiliar abierto: solo se compone dentro de un allOf cerrado
  '#/components/schemas/DocumentExtractResponse/properties/extractedData', // la forma por tipo de documento la cierran FEAT-01b y FEAT-01c
];

const isExempt = (pointer) => OPEN_BY_DESIGN.some((exempt) => pointer === exempt || pointer.startsWith(`${exempt}/`));
const isObjectSchema = (schema) => schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'));
const isNullableType = (schema) => Array.isArray(schema.type) && schema.type.includes('null');

function closureProblems(schema, parentKeyword) {
  if (!isObjectSchema(schema) || parentKeyword === 'allOf') return [];
  if (Array.isArray(schema.allOf)) {
    return schema.unevaluatedProperties === false ? [] : ['la composición allOf debe declarar unevaluatedProperties: false'];
  }
  const problems = [];
  if (schema.additionalProperties !== false) problems.push('debe declarar additionalProperties: false');
  if (!Array.isArray(schema.required) && !(schema.minProperties >= 1)) problems.push('debe declarar required (o minProperties)');
  return problems;
}

function nullableEnumProblems(schema) {
  const missingNull = Array.isArray(schema.enum) && isNullableType(schema) && !schema.enum.includes(null);
  return missingNull ? ['el enum nullable debe incluir null en su enum'] : [];
}

export function assertClosedSchemas(specs) {
  return [...PROVIDERS, EVIDENCE].flatMap((name) => {
    const { file, raw } = specs[name];
    if (!raw) return [];
    return [...allSchemas(raw)]
      .filter(({ pointer }) => !isExempt(pointer))
      .flatMap(({ schema, pointer, parentKeyword }) =>
        [...closureProblems(schema, parentKeyword), ...nullableEnumProblems(schema)].map((problem) => report(file, pointer, problem)),
      );
  });
}
