import type {
  RegistroDeDato,
  RegistrosDeCompletitud,
} from '../../src/modules/completeness/ports.js';

/** Entidades que el repositorio real sabe leer (`Exam` no: `clinical.exam` no tiene `review_status`). */
const ENTIDADES_SOPORTADAS: readonly string[] = [
  'Diagnosis',
  'Biomarker',
  'ClinicalAttribute',
  'PriorTreatment',
  'ClinicalEvent',
];

export interface OpcionesDeRegistrosFalsos {
  readonly diagnosticos: readonly RegistroDeDato[];
  /** `existePaciente`; por defecto `true`. */
  readonly existe?: boolean;
  /** Cada llamada a `registrosSinFiltrarPorRevision` anota aquí las entidades pedidas. */
  readonly pedidos?: (readonly string[])[];
}

/**
 * Fake del puerto `RegistrosDeCompletitud` que cumple su contrato (LSP): una clave por cada entidad pedida (`[]` si no
 * hay filas, sin repetir) y, como el repositorio real, `entidad_de_destino_no_soportada <entidad>` para una que no lee.
 */
export function registrosDeCompletitudFalsos(
  opciones: OpcionesDeRegistrosFalsos,
): RegistrosDeCompletitud {
  return {
    existePaciente: async () => opciones.existe ?? true,
    registrosSinFiltrarPorRevision: async (_patientId, entidades) => {
      opciones.pedidos?.push(entidades);
      const resultado: Record<string, readonly RegistroDeDato[]> = {};
      for (const entidad of new Set(entidades)) {
        if (!ENTIDADES_SOPORTADAS.includes(entidad)) {
          throw new Error(`entidad_de_destino_no_soportada ${entidad}`);
        }
        resultado[entidad] = entidad === 'Diagnosis' ? opciones.diagnosticos : [];
      }
      return resultado;
    },
  };
}
