import type { CompletenessView } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { zCompletenessView } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import type { ChecklistDelPaciente } from './ports.js';

/**
 * Del checklist del dominio a `CompletenessView` del contrato (`key` pasa a `item`; los valores de la condición se
 * copian para no compartir el arreglo del catálogo). El resultado se valida con el Zod generado del spec: una entidad
 * de destino que el contrato no declara es un error del catálogo y falla cerrado (500), nunca una respuesta fuera de
 * contrato.
 */
export function comoVistaDelChecklist(checklist: ChecklistDelPaciente): CompletenessView {
  return zCompletenessView.parse({
    catalogVersion: checklist.catalogVersion,
    cancerTypeEnabled: checklist.cancerTypeEnabled,
    items: checklist.items.map((item) => ({
      item: item.key,
      label: item.label,
      status: item.status,
      origin: item.origin,
      provenance: item.provenance,
      destination: { entity: item.destination.entity, field: item.destination.field },
      condition:
        item.condition === null ? null : { ...item.condition, values: [...item.condition.values] },
    })),
  });
}
