import type { ConversationDataLink } from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  CaseFact,
  ClinicalContext,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { CasoClinico } from '../evidence-analysis.repository.js';
import type { MapaDeDataRefs } from '../ports.js';

/** Qué dato del paciente respalda un `factRef`: solo vive en Backend 1 durante el turno (nunca viaja a Backend 2). */
export type EnlaceDelHecho = Omit<ConversationDataLink, 'factRef'>;

export interface HechosDelCaso {
  caseFacts: CaseFact[];
  enlaces: ReadonlyMap<string, EnlaceDelHecho>;
}

/**
 * Hechos del caso del turno (`f1`, `f2`…) desde el contexto YA desidentificado: la verbalización sale del texto
 * enmascarado y sin fechas absolutas; el día relativo y la fecha registrada salen de las filas del caso y solo van al
 * enlace del navegador.
 */
export function construirHechosDelCaso(
  contexto: ClinicalContext,
  dataRefs: MapaDeDataRefs,
  caso: CasoClinico,
): HechosDelCaso {
  void contexto;
  void dataRefs;
  void caso;
  throw new Error('no implementado');
}
