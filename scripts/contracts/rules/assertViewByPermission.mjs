/** AC-17 [Pre-S1 resp. 27, E-04]: toda operación que responde una vista por permiso declara x-view-by-permission y su vista por defecto no lleva datos clínicos. */
import { reporter } from '../lib/findings.mjs';
import { findResponse, jsonSchemaOf, labelOf, listOperations } from '../lib/operations.mjs';
import { permissionMatrix } from '../lib/permissions.mjs';
import { walkResolved } from '../lib/resolvedWalk.mjs';
import { CLINICAL_API, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertViewByPermission', 'AC-17');

const ADMIN_VIEW = 'PatientAdminSummary';
/** Propiedades clínicas que la vista por defecto no puede tener. */
const CLINICAL_PROPERTIES = ['diagnosis', 'biomarkers', 'recentBiomarkers', 'documents', 'analyses', 'openReviewCount', 'pendingReviewCount', 'missingCriticalCount'];

/** Propiedades con la identidad en claro: solo la ficha las devuelve, con auditoría (D-7, resp. 36). */
const UNMASKED_IDENTITY = ['identification', 'fullName', 'nationalId'];

/** Los `oneOf` de vistas que la respuesta 200 contiene (directos o dentro de sus propiedades). */
function viewChoices(spec, entry) {
  const success = findResponse(spec, entry, 200);
  const schema = success && jsonSchemaOf(spec, success);
  const choices = [];
  if (schema) {
    walkResolved(spec, schema.node, schema.pointer, ({ schema: node }) => {
      const refs = (node.oneOf ?? []).map((member) => member.$ref);
      if (refs.includes(schemaPointer(ADMIN_VIEW))) choices.push(refs);
    });
  }
  return choices;
}

function checkMapping(file, entry, mapping, choices, matrix) {
  const pointer = `${entry.pointer}/x-view-by-permission`;
  const found = [];
  for (const [permission, view] of Object.entries(mapping)) {
    if (permission !== 'default' && !matrix.includes(permission)) found.push(report(file, pointer, `${permission} no está en la matriz de permisos`));
    if (!choices.flat().includes(schemaPointer(view))) found.push(report(file, pointer, `la vista ${view} no está en el oneOf de la respuesta`));
  }
  return found;
}

/** El listado y la búsqueda devuelven nombre y documento enmascarados; la identidad en claro solo viaja en la ficha. */
function checkMaskedIdentity(specs, file, entry, mapping) {
  if (entry.route.includes('{')) return [];
  return Object.values(mapping).flatMap((view) => UNMASKED_IDENTITY
    .filter((name) => Object.hasOwn(schemaOf(specs, CLINICAL_API, view)?.properties ?? {}, name))
    .map((name) => report(file, `${entry.pointer}/x-view-by-permission`, `la vista ${view} del listado no puede tener ${name}: nombre y documento van enmascarados`)));
}

function checkDefaultView(specs, file, entry, mapping) {
  const view = mapping?.default;
  const schema = view && schemaOf(specs, CLINICAL_API, view);
  const pointer = `${entry.pointer}/x-view-by-permission/default`;
  if (!schema) return [report(file, pointer, 'x-view-by-permission debe declarar la vista por defecto (sin datos clínicos)')];
  return CLINICAL_PROPERTIES.filter((name) => Object.hasOwn(schema.properties ?? {}, name))
    .map((name) => report(file, pointer, `la vista por defecto ${view} no puede tener ${name}: el administrador no lee datos clínicos`));
}

export function assertViewByPermission(specs, examples, docs) {
  const { file, bundled } = specs[CLINICAL_API];
  if (!bundled) return [];
  const matrix = permissionMatrix(docs.dataModel?.text).map((row) => row.code);
  return listOperations(bundled).flatMap((entry) => {
    const choices = viewChoices(bundled, entry);
    if (choices.length === 0) return [];
    const mapping = entry.operation['x-view-by-permission'];
    if (!mapping) return [report(file, entry.pointer, `${labelOf(entry)} responde una vista por permiso y debe declarar x-view-by-permission`)];
    return [...checkMapping(file, entry, mapping, choices, matrix), ...checkDefaultView(specs, file, entry, mapping), ...checkMaskedIdentity(specs, file, entry, mapping)];
  });
}
