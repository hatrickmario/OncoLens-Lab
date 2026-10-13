/** AC-2 [D-01]: ni la ruta /platform/rag/query ni una propiedad recommendations; el vocabulario v1.0 no vuelve. */
import { reporter } from '../lib/findings.mjs';
import { pointerOf } from '../lib/pointer.mjs';
import { allSchemas, walkJson } from '../lib/walk.mjs';
import { EVIDENCE, PROVIDERS } from '../lib/specs.mjs';

const report = reporter('assertNoV1Vocabulary', 'AC-2');

const FORBIDDEN_ROUTE = '/platform/rag/query';
const FORBIDDEN_PROPERTY = 'recommendations';

function checkSpec({ file, raw }) {
  const routes = Object.keys(raw.paths ?? {})
    .filter((route) => route === FORBIDDEN_ROUTE)
    .map((route) => report(file, pointerOf('paths', route), `la ruta ${route} es del vocabulario v1.0; usar POST /platform/evidence-analyses`));
  const properties = [...allSchemas(raw)]
    .filter(({ schema }) => Object.hasOwn(schema.properties ?? {}, FORBIDDEN_PROPERTY))
    .map(({ pointer }) => report(file, `${pointer}/properties/${FORBIDDEN_PROPERTY}`, 'la propiedad recommendations es del vocabulario v1.0; usar evidenceOptions'));
  return [...routes, ...properties];
}

function checkExample(file, data) {
  return [...walkJson(data)]
    .filter(({ key }) => key === FORBIDDEN_PROPERTY)
    .map(({ pointer }) => report(file, pointer, 'la clave recommendations es del vocabulario v1.0; usar evidenceOptions'));
}

export function assertNoV1Vocabulary(specs, examples) {
  const fromSpecs = [...PROVIDERS, EVIDENCE].filter((name) => specs[name].raw).flatMap((name) => checkSpec(specs[name]));
  const fromExamples = Object.entries(examples.files ?? {}).flatMap(([name, data]) => checkExample(`${examples.dir}/${name}`, data));
  return [...fromSpecs, ...fromExamples];
}
