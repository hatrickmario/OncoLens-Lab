/** AC-16 [Pre-S1 resp. 28]: el extracto de readme §4 entre sus marcadores es exactamente lo que genera contracts:readme-extract. */
import { reporter } from '../lib/findings.mjs';
import { PATHS } from '../lib/paths.mjs';
import { currentReadmeExtract, renderReadmeExtract } from '../lib/readmeExtract.mjs';
import { CLINICAL_API } from '../lib/specs.mjs';

const report = reporter('assertReadmeExtractInSync', 'AC-16');

const README = PATHS.readme;

export function assertReadmeExtractInSync(specs, examples, docs) {
  const bundled = specs[CLINICAL_API].bundled;
  if (!bundled) return [];
  if (!docs.readme) return [report(README, '#', 'archivo ausente')];
  const current = currentReadmeExtract(docs.readme.text);
  if (current === null) return [report(README, '#', 'faltan los marcadores contracts:readme-extract:start y :end')];
  return current === renderReadmeExtract(bundled)
    ? []
    : [report(README, 'contracts:readme-extract', 'el extracto del readme no coincide con el spec de clinical-api: regenerarlo con npm run contracts:readme-extract (no se edita a mano)')];
}
