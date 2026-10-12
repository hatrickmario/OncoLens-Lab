/** AC-1: toda la API usa camelCase; los nombres snake_case solo existen en data-model.md. */
import { reporter } from '../lib/findings.mjs';
import { walkJson, allSchemas } from '../lib/walk.mjs';
import { pointerOf } from '../lib/pointer.mjs';
import { EVIDENCE, PROVIDERS } from '../lib/specs.mjs';

const report = reporter('assertCamelCaseProperties', 'AC-1');

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

function checkSchemas(file, doc) {
  return [...allSchemas(doc)].flatMap(({ schema, pointer }) =>
    Object.keys(schema.properties ?? {})
      .filter((name) => !CAMEL_CASE.test(name))
      .map((name) => report(file, `${pointer}/properties/${pointerOf(name).slice(2)}`, `la propiedad ${name} debe estar en camelCase`)),
  );
}

function checkExample(file, data) {
  return [...walkJson(data)]
    .filter(({ key }) => key !== null && !/^\d+$/.test(key) && !CAMEL_CASE.test(key))
    .map(({ pointer, key }) => report(file, pointer, `la clave ${key} debe estar en camelCase`));
}

export function assertCamelCaseProperties(specs, examples) {
  const fromSpecs = [...PROVIDERS, EVIDENCE].flatMap((name) => (specs[name].raw ? checkSchemas(specs[name].file, specs[name].raw) : []));
  const fromExamples = Object.entries(examples.files ?? {}).flatMap(([name, data]) => checkExample(`${examples.dir}/${name}`, data));
  return [...fromSpecs, ...fromExamples];
}
