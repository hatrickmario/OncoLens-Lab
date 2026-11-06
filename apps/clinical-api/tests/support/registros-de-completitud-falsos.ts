import type {
  RegistroDeDato,
  RegistrosDeCompletitud,
  RegistrosPorEntidad,
} from '../../src/modules/completeness/ports.js';

/** Entidades que el repositorio real sabe leer (`Exam` no: `clinical.exam` no tiene `review_status`). */
const ENTIDADES_SOPORTADAS: readonly string[] = [
  'Diagnosis',
  'Biomarker',
  'ClinicalAttribute',
  'PriorTreatment',
  'ClinicalEvent',
];

type DiagnosticosPorPaciente = Readonly<Record<string, readonly RegistroDeDato[]>>;

export interface OpcionesDeRegistrosFalsos {
  /** Un arreglo vale para todos los pacientes pedidos; un objeto asigna los diagnósticos por `patientId` (`[]` si falta). */
  readonly diagnosticos: readonly RegistroDeDato[] | DiagnosticosPorPaciente;
  /** Ids que `existenPacientes` reconoce; por defecto, todos los pedidos. */
  readonly existentes?: readonly string[];
  /** Cada llamada a `registrosVariosSinFiltrarPorRevision` anota aquí las entidades pedidas. */
  readonly pedidos?: (readonly string[])[];
}

/**
 * Fake del puerto `RegistrosDeCompletitud` que cumple su contrato (LSP): agrupa por paciente, una clave por cada
 * entidad pedida (`[]` si no hay filas, sin repetir) y, como el repositorio real, lanza
 * `entidad_de_destino_no_soportada <entidad>` para una que no lee.
 */
export function registrosDeCompletitudFalsos(
  opciones: OpcionesDeRegistrosFalsos,
): RegistrosDeCompletitud {
  const diagnosticosDe = (patientId: string): readonly RegistroDeDato[] =>
    Array.isArray(opciones.diagnosticos)
      ? opciones.diagnosticos
      : ((opciones.diagnosticos as DiagnosticosPorPaciente)[patientId] ?? []);
  const registrosDe = (patientId: string, entidades: readonly string[]): RegistrosPorEntidad => {
    const resultado: Record<string, readonly RegistroDeDato[]> = {};
    for (const entidad of new Set(entidades)) {
      if (!ENTIDADES_SOPORTADAS.includes(entidad)) {
        throw new Error(`entidad_de_destino_no_soportada ${entidad}`);
      }
      resultado[entidad] = entidad === 'Diagnosis' ? diagnosticosDe(patientId) : [];
    }
    return resultado;
  };
  return {
    existenPacientes: async (patientIds) =>
      new Set(patientIds.filter((id) => opciones.existentes?.includes(id) ?? true)),
    // Una sola anotación por llamada (como una sola consulta por entidad en el real).
    registrosVariosSinFiltrarPorRevision: async (patientIds, entidades) => {
      opciones.pedidos?.push(entidades);
      return new Map(patientIds.map((id) => [id, registrosDe(id, entidades)]));
    },
  };
}
