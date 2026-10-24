import { calcularChecklist, tipoDeCancerActivo } from './completeness.rules.js';
import type {
  CatalogoDeDatosCriticos,
  ChecklistDelPaciente,
  CompletenessService,
  RegistrosDeCompletitud,
} from './ports.js';

export interface DependenciasDelServicio {
  readonly registros: RegistrosDeCompletitud;
  readonly catalogo: CatalogoDeDatosCriticos;
}

/**
 * Checklist determinista de datos críticos (US-002, FR-23): carga el catálogo montado y los registros del paciente y
 * delega la regla de cinco pasos en el motor puro. Sin LLM, sin `rag-orchestrator`, sin aleatoriedad.
 */
export function createCompletenessService(
  dependencias: DependenciasDelServicio,
): CompletenessService {
  const { registros, catalogo } = dependencias;
  return {
    async calcular(patientId): Promise<ChecklistDelPaciente> {
      const catalogVersion = catalogo.version();
      const { Diagnosis: diagnosticos = [] } = await registros.registrosSinFiltrarPorRevision(
        patientId,
        ['Diagnosis'],
      );
      const cancerType = tipoDeCancerActivo(diagnosticos);
      const datos = cancerType === null ? undefined : catalogo.deTipo(cancerType);
      if (cancerType === null || datos === undefined) return { catalogVersion, items: [] };
      // El diagnóstico activo ya está leído: se reutiliza para que tipo y condiciones salgan del mismo registro.
      const entidades = datos.items
        .map((item) => item.destination.entity)
        .filter((entidad) => entidad !== 'Diagnosis');
      const delPaciente = await registros.registrosSinFiltrarPorRevision(patientId, entidades);
      return {
        catalogVersion,
        items: calcularChecklist({
          cancerType,
          items: datos.items,
          verifiedReviewStatuses: datos.verifiedReviewStatuses,
          registros: { ...delPaciente, Diagnosis: diagnosticos },
        }),
      };
    },
  };
}
