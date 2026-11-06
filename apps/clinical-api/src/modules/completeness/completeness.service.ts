import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import { procedenciaDeItem } from './completeness.procedencia.js';
import {
  calcularChecklist,
  diagnosticoVigente,
  itemsDelTipoActivo,
  cumplimientoDelItem,
  tipoDeCancerActivo,
} from './completeness.rules.js';
import type {
  CatalogoDeDatosCriticos,
  ChecklistDelPaciente,
  CompletenessEnLote,
  CompletenessService,
  DatosCriticosDeUnTipo,
  ItemDeDatoCritico,
  ItemDelChecklist,
  RegistroDeDato,
  RegistrosDeCompletitud,
  RegistrosPorEntidad,
  ResultadoDelChecklist,
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
  const cumplimiento = presente ? cumplimientoDelItem(item, registros) : undefined;
  return {
    key: item.key,
    label: item.label,
    status: estado.status,
    gapType: null,
    ...procedenciaDeItem(item, estado.status, cumplimiento?.registro),
    // Solo los ítems que el catálogo puede cumplir por declaración exponen la vía (aditivo, ADR-26).
    ...(cumplimiento !== undefined &&
      item.satisfiedBy !== undefined && { resolvedBy: cumplimiento.resolvedBy }),
  };
}

/** El tipo no se evalúa (sin diagnóstico activo vigente o fuera de `ENABLED_CANCER_TYPES`): 200 sin ítems, nunca un error. */
function sinChecklist(catalogVersion: string): ChecklistDelPaciente {
  return { catalogVersion, cancerTypeEnabled: false, items: [] };
}

/** Las entidades de destino y de declaración que se leen aparte del diagnóstico (el `Diagnosis` vigente ya está leído). */
function entidadesDeDestinoSinDiagnostico(datos: DatosCriticosDeUnTipo): string[] {
  const entidades = new Set(
    datos.items.flatMap((item) => [
      item.destination.entity,
      ...(item.satisfiedBy ?? []).map((declaracion) => declaracion.entity),
    ]),
  );
  entidades.delete('Diagnosis');
  return [...entidades];
}

/** Un paciente cuyo tipo de cáncer se evalúa: su diagnóstico vigente es la única fuente de tipo y condiciones. */
interface PacienteAEvaluar {
  readonly patientId: string;
  readonly cancerType: string;
  readonly vigente: RegistroDeDato | undefined;
}

/** Los ítems del tipo activo con su estado y procedencia, a partir de los registros ya leídos del paciente. */
function itemsDelPaciente(
  paciente: PacienteAEvaluar,
  datos: DatosCriticosDeUnTipo,
  delPaciente: RegistrosPorEntidad,
): ItemDelChecklist[] {
  // Solo el Diagnosis vigente: tipo, condiciones e ítems de destino Diagnosis salen del mismo registro.
  const completos = {
    ...delPaciente,
    Diagnosis: paciente.vigente === undefined ? [] : [paciente.vigente],
  };
  const estados = calcularChecklist({
    cancerType: paciente.cancerType,
    items: datos.items,
    verifiedReviewStatuses: datos.verifiedReviewStatuses,
    registros: completos,
  });
  const delTipo = itemsDelTipoActivo(datos.items, paciente.cancerType);
  return estados.map((estado) => conProcedencia(estado, delTipo, completos));
}

const noDisponible = (error: unknown): ResultadoDelChecklist => ({
  estado: 'no_disponible',
  error,
});

type Resultados = Map<string, ResultadoDelChecklist>;

/** Falla cerrado con 404: sin diagnóstico leído, el paciente solo existe si lo confirma la base (una consulta para todos). */
async function clasificarSinDiagnostico(
  { registros }: DependenciasDelServicio,
  patientIds: readonly string[],
  resultados: Resultados,
  catalogVersion: string,
): Promise<void> {
  if (patientIds.length === 0) return;
  const existentes = await registros.existenPacientes(patientIds);
  for (const patientId of patientIds) {
    resultados.set(
      patientId,
      existentes.has(patientId)
        ? { estado: 'ok', checklist: sinChecklist(catalogVersion) }
        : noDisponible(new PacienteNoEncontradoError()),
    );
  }
}

/** Lee una vez, para todos los pacientes del tipo, sus entidades de destino y calcula cada checklist aislado de los demás. */
async function calcularDelTipo(
  { registros }: DependenciasDelServicio,
  entrada: { datos: DatosCriticosDeUnTipo; pacientes: readonly PacienteAEvaluar[] },
  resultados: Resultados,
  catalogVersion: string,
): Promise<void> {
  const { datos, pacientes } = entrada;
  const entidades = entidadesDeDestinoSinDiagnostico(datos);
  let leidos: ReadonlyMap<string, RegistrosPorEntidad>;
  try {
    leidos =
      entidades.length === 0
        ? new Map()
        : await registros.registrosVariosSinFiltrarPorRevision(
            pacientes.map((paciente) => paciente.patientId),
            entidades,
          );
  } catch (error) {
    for (const paciente of pacientes) resultados.set(paciente.patientId, noDisponible(error));
    return;
  }
  for (const paciente of pacientes) {
    try {
      const items = itemsDelPaciente(paciente, datos, leidos.get(paciente.patientId) ?? {});
      resultados.set(paciente.patientId, {
        estado: 'ok',
        checklist: { catalogVersion, cancerTypeEnabled: true, items },
      });
    } catch (error) {
      resultados.set(paciente.patientId, noDisponible(error));
    }
  }
}

/** Reparte a los pacientes: sin diagnóstico activo, sin tipo evaluable (checklist vacío) o por tipo de cáncer a calcular. */
function repartirPorDiagnostico(
  { catalogo, tiposHabilitados }: DependenciasDelServicio,
  diagnosticos: ReadonlyMap<string, RegistrosPorEntidad>,
  patientIds: readonly string[],
  resultados: Resultados,
): { sinDiagnostico: string[]; porTipo: Map<string, PacienteAEvaluar[]> } {
  const sinDiagnostico: string[] = [];
  const porTipo = new Map<string, PacienteAEvaluar[]>();
  for (const patientId of patientIds) {
    const activos = diagnosticos.get(patientId)?.['Diagnosis'] ?? [];
    const cancerType = tipoDeCancerActivo(activos);
    if (activos.length === 0) {
      sinDiagnostico.push(patientId);
    } else if (
      cancerType === null ||
      !tiposHabilitados.estaHabilitado(cancerType) ||
      catalogo.deTipo(cancerType) === undefined
    ) {
      resultados.set(patientId, { estado: 'ok', checklist: sinChecklist(catalogo.version()) });
    } else {
      const paciente = { patientId, cancerType, vigente: diagnosticoVigente(activos) };
      porTipo.set(cancerType, [...(porTipo.get(cancerType) ?? []), paciente]);
    }
  }
  return { sinDiagnostico, porTipo };
}

/** Lecturas acotadas: consultas = 1 + nº de tipos de cáncer presentes (más una si algún paciente no tiene diagnóstico). */
async function calcularVarios(
  dependencias: DependenciasDelServicio,
  patientIds: readonly string[],
): Promise<ReadonlyMap<string, ResultadoDelChecklist>> {
  const { registros, catalogo } = dependencias;
  const unicos = [...new Set(patientIds)];
  const resultados: Resultados = new Map();
  if (unicos.length === 0) return resultados;
  const catalogVersion = catalogo.version();
  const diagnosticos = await registros.registrosVariosSinFiltrarPorRevision(unicos, ['Diagnosis']);
  const { sinDiagnostico, porTipo } = repartirPorDiagnostico(
    dependencias,
    diagnosticos,
    unicos,
    resultados,
  );
  await clasificarSinDiagnostico(dependencias, sinDiagnostico, resultados, catalogVersion);
  for (const [cancerType, pacientes] of porTipo) {
    const datos = catalogo.deTipo(cancerType) as DatosCriticosDeUnTipo;
    await calcularDelTipo(dependencias, { datos, pacientes }, resultados, catalogVersion);
  }
  // El orden del resultado es el de la petición, sea cual sea el orden en que se agruparon los tipos.
  return new Map(
    unicos.map((patientId) => [patientId, resultados.get(patientId) as ResultadoDelChecklist]),
  );
}

/**
 * Checklist determinista de datos críticos (US-002, US-003, FR-23): carga el catálogo montado y los registros del
 * paciente y delega la regla de cinco pasos en el motor puro. Es la ÚNICA implementación: la usan el endpoint
 * `/completeness`, el contador de la ficha, el del listado y la búsqueda (en lote) y los faltantes del análisis;
 * `calcular` se apoya en `calcularVarios`, así que no pueden divergir. Sin LLM, sin `rag-orchestrator`, sin azar.
 */
export function createCompletenessService(
  dependencias: DependenciasDelServicio,
): CompletenessService & CompletenessEnLote {
  return {
    calcularVarios: (patientIds) => calcularVarios(dependencias, patientIds),
    async calcular(patientId): Promise<ChecklistDelPaciente> {
      const resultado = (await calcularVarios(dependencias, [patientId])).get(patientId);
      if (resultado?.estado !== 'ok') throw resultado?.error ?? new PacienteNoEncontradoError();
      return resultado.checklist;
    },
  };
}
