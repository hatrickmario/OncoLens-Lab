/** AC-17 [Pre-S1 resp. 24, 27, 29]: cada operación de clinical-api declara x-permission con códigos concretos de la matriz; publico solo en el login. */
import { reporter } from '../lib/findings.mjs';
import { labelOf, listOperations } from '../lib/operations.mjs';
import { permissionMatrix } from '../lib/permissions.mjs';
import { CLINICAL_API } from '../lib/specs.mjs';

const report = reporter('assertOperationsDeclarePermission', 'AC-17');

const PUBLIC = 'publico';
const PUBLIC_OPERATION = 'POST /platform/auth/login';

function checkCode(file, entry, code, matrix) {
  const pointer = `${entry.pointer}/x-permission`;
  if (typeof code !== 'string' || code.includes('*')) return [report(file, pointer, `${JSON.stringify(code)} no es un código concreto (sin comodines)`)];
  if (code === PUBLIC) {
    return labelOf(entry) === PUBLIC_OPERATION ? [] : [report(file, pointer, `${PUBLIC} solo se admite en ${PUBLIC_OPERATION}`)];
  }
  return matrix.includes(code) ? [] : [report(file, pointer, `el código ${code} no está en la matriz de permisos de data-model.md`)];
}

export function assertOperationsDeclarePermission(specs, examples, docs) {
  const { file, bundled } = specs[CLINICAL_API];
  if (!bundled) return [];
  const matrix = permissionMatrix(docs.dataModel?.text).map((row) => row.code);
  return listOperations(bundled).flatMap((entry) => {
    const declared = entry.operation['x-permission'];
    if (declared === undefined) return [report(file, entry.pointer, `${labelOf(entry)} debe declarar x-permission`)];
    return [declared].flat().flatMap((code) => checkCode(file, entry, code, matrix));
  });
}
