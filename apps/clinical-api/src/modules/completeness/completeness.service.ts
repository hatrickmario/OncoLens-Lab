import type { TiposDeCancerHabilitados } from '../evidence-analysis/ports.js';
import { PacienteNoEncontradoError } from '../patients/patients.errores.js';
import { procedenciaDeItem } from './completeness.procedencia.js';
import {
  calcularChecklist,
  itemsDelTipoActivo,
  registroQueCuentaDelItem,
  tipoDeCancerActivo,
} from './completeness.rules.js';
import type {
  CatalogoDeDatosCriticos,
  ChecklistDelPaciente,
  CompletenessService,
  DatosCriticosDeUnTipo,
  ItemDeDatoCritico,
  ItemDelChecklist,
  RegistroDeDato,
  RegistrosDeCompletitud,
  RegistrosPorEntidad,
} from './ports.js';

export interface DependenciasDelServicio {
  readonly registros: RegistrosDeCompletitud;
  readonly catalogo: CatalogoDeDatosCriticos;
  /** `ENABLED_CANCER_TYPES` validada contra el catálogo (RN-20, RN-22). */
  readonly tiposHabilitados: TiposDeCancerHabilitados;
}

/** Un ítem con su etiqueta del catálogo y la procedencia del registro que lo hizo presente (US-003, D1). */
function conProcedencia(
  estado: { key: string; status: ItemDelChecklist['status'] },
  delTipo: readonly ItemDeDatoCritico[],
  registros: RegistrosPorEntidad,
): ItemDelChecklist {
  const item = delTipo.find((candidato) => candidato.key === estado.key);
  if (item === undefined) throw new Error('item_del_catalogo_inexistente');
  const presente =
    estado.status === 'presente_verificado' || estado.status === 'presente_sin_verificar';
  const registro = presente ? registroQueCuentaDelItem(item, registros) : undefined;
  return {
    key: item.key,
    label: item.label,
    status: estado.status,
    ...procedenciaDeItem(item, estado.status, registro),
  };
}

/** El tipo no se evalúa (sin diagnóstico activo vigente o fuera de `ENABLED_CANCER_TYPES`): 200 sin ítems, nunca un error. */
function sinChecklist(catalogVersion: string): ChecklistDelPaciente {
  return { catalogVersion, cancerTypeEnabled: false, items: [] };
}

/** Falla cerrado con 404 si el paciente no existe; con un diagnóstico leído ya se sabe que existe (sin consulta extra). */
async function exigirPacienteExistente(
  registros: RegistrosDeCompletitud,
  patientId: string,
  diagnosticos: readonly RegistroDeDato[],
): Promise<void> {
  if (diagnosticos.length > 0 || (await registros.existePaciente(patientId))) return;
  throw new PacienteNoEncontradoError();
}

/** Los ítems del tipo activo con su estado y procedencia; reutiliza el diagnóstico ya leído (tipo y condiciones salen del mismo registro). */
async function itemsDelTipoDeCancer(
  registros: RegistrosDeCompletitud,
  entrada: {
    patientId: string;
    cancerType: string;
    datos: DatosCriticosDeUnTipo;
    diagnosticos: readonly RegistroDeDato[];
  },
): Promise<ItemDelChecklist[]> {
  const { patientId, cancerType, datos, diagnosticos } = entrada;
  const entidades = datos.items
    .map((item) => item.destination.entity)
    .filter((entidad) => entidad !== 'Diagnosis');
  const delPaciente = await registros.registrosSinFiltrarPorRevision(patientId, entidades);
  const completos = { ...delPaciente, Diagnosis: diagnosticos };
  const estados = calcularChecklist({
    cancerType,
    items: datos.items,
    verifiedReviewStatuses: datos.verifiedReviewStatuses,
    registros: completos,
  });
  const delTipo = itemsDelTipoActivo(datos.items, cancerType);
  return estados.map((estado) => conProcedencia(estado, delTipo, completos));
}

/**
 * Checklist determinista de datos críticos (US-002, US-003, FR-23): carga el catálogo montado y los registros del
 * paciente y delega la regla de cinco pasos en el motor puro. Es la ÚNICA implementación: la usan el endpoint
 * `/completeness`, el contador de la ficha y los faltantes del análisis. Sin LLM, sin `rag-orchestrator`, sin azar.
 */
export function createCompletenessService(
  dependencias: DependenciasDelServicio,
): CompletenessService {
  const { registros, catalogo, tiposHabilitados } = dependencias;
  return {
    async calcular(patientId): Promise<ChecklistDelPaciente> {
      const catalogVersion = catalogo.version();
      const { Diagnosis: diagnosticos = [] } = await registros.registrosSinFiltrarPorRevision(
        patientId,
        ['Diagnosis'],
      );
      await exigirPacienteExistente(registros, patientId, diagnosticos);
      const cancerType = tipoDeCancerActivo(diagnosticos);
      const datos =
        cancerType !== null && tiposHabilitados.estaHabilitado(cancerType)
          ? catalogo.deTipo(cancerType)
          : undefined;
      if (cancerType === null || datos === undefined) return sinChecklist(catalogVersion);
      const items = await itemsDelTipoDeCancer(registros, {
        patientId,
        cancerType,
        datos,
        diagnosticos,
      });
      return { catalogVersion, cancerTypeEnabled: true, items };
    },
  };
}
