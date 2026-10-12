/** Extracto no normativo del readme §4: tres operaciones de clinical-api copiadas del spec empaquetado (`[Pre-S1 resp. 28]`). */
import YAML from 'yaml';

export const START_MARKER = '<!-- contracts:readme-extract:start -->';
export const END_MARKER = '<!-- contracts:readme-extract:end -->';

/** Operaciones representativas: carga de documento, análisis de evidencia y ficha del paciente. */
export const EXTRACT_OPERATIONS = [
  ['post', '/platform/patients/{patientId}/documents'],
  ['post', '/platform/evidence-analyses'],
  ['get', '/platform/patients/{patientId}'],
];

const NOTE =
  '> Extracto generado, no normativo, de `apps/clinical-api/openapi.yaml`: operaciones seleccionadas del spec empaquetado (los `$ref` apuntan a sus `components`). El spec manda.';

/** Contenido que debe haber entre los marcadores: la marca de extracto y el YAML de las tres operaciones. */
export function renderReadmeExtract(bundled) {
  const paths = {};
  for (const [method, route] of EXTRACT_OPERATIONS) {
    const operation = bundled?.paths?.[route]?.[method];
    if (operation) paths[route] = { ...paths[route], [method]: operation };
  }
  const yaml = YAML.stringify({ paths }, { lineWidth: 0 }).trimEnd();
  return `${NOTE}\n\n\`\`\`yaml\n${yaml}\n\`\`\``;
}

const BLOCK = new RegExp(`${START_MARKER}\\n([\\s\\S]*?)\\n?${END_MARKER}`);

/** Lo que hay hoy entre los marcadores del readme, o `null` si faltan. */
export function currentReadmeExtract(readme) {
  return readme.match(BLOCK)?.[1] ?? null;
}

/** El readme con `block` entre los marcadores, o `null` si faltan. */
export function replaceReadmeExtract(readme, block) {
  if (!BLOCK.test(readme)) return null;
  return readme.replace(BLOCK, () => `${START_MARKER}\n${block}\n${END_MARKER}`);
}
