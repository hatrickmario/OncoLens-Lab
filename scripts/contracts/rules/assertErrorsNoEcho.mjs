/** AC-17 [RN-10, privacy M-10]: ningún error repite el valor recibido; el detail de validación es cerrado y sin input ni ctx. */
import { reporter } from '../lib/findings.mjs';
import { PROVIDERS, schemaPointer } from '../lib/specs.mjs';
import { walkJson, walkSchema } from '../lib/walk.mjs';

const report = reporter('assertErrorsNoEcho', 'AC-17 · RN-10');

/** Propiedades que reproducirían lo que envió quien llama. */
const ECHO_PROPERTIES = ['input', 'ctx', 'value', 'received', 'receivedValue', 'body'];
const isErrorSchema = (name) => /^Error/.test(name);

function checkSchemas({ file, raw }) {
  const found = [];
  for (const [name, schema] of Object.entries(raw.components?.schemas ?? {}).filter(([name]) => isErrorSchema(name))) {
    for (const node of walkSchema(schema, schemaPointer(name))) {
      for (const property of ECHO_PROPERTIES.filter((echo) => Object.hasOwn(node.schema.properties ?? {}, echo))) {
        found.push(report(file, `${node.pointer}/properties/${property}`, `${property} reproduce el valor recibido: los errores nunca lo repiten`));
      }
    }
  }
  const detail = raw.components?.schemas?.ErrorValidacion?.properties?.detail?.items;
  if (detail && (detail.additionalProperties !== false || JSON.stringify([...(detail.required ?? [])].sort()) !== JSON.stringify(['loc', 'msg', 'type']))) {
    found.push(report(file, `${schemaPointer('ErrorValidacion')}/properties/detail/items`, 'detail debe ser cerrado y exigir solo loc, msg y type'));
  }
  return found;
}

function checkExamples(examples) {
  const errorExamples = (examples.index?.examples ?? []).filter((entry) => entry.target.includes('/responses/'));
  return errorExamples.flatMap((entry) =>
    [...walkJson(examples.files?.[entry.file] ?? {})]
      .filter(({ key }) => ECHO_PROPERTIES.includes(key))
      .map(({ pointer, key }) => report(`${examples.dir}/${entry.file}`, pointer, `${key} reproduce el valor recibido: los errores nunca lo repiten`)),
  );
}

export function assertErrorsNoEcho(specs, examples) {
  const fromSpecs = PROVIDERS.filter((name) => specs[name].raw).flatMap((name) => checkSchemas(specs[name]));
  return [...fromSpecs, ...checkExamples(examples)];
}
