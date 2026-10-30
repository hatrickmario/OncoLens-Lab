/** Estado de cada dato crítico en el checklist (FR-23). */
export type EstadoDelChecklist =
  'presente_verificado' | 'presente_sin_verificar' | 'faltante' | 'no_aplica';

/** Vocabulario de operadores de condición del catálogo (L1D-93): ÚNICO sitio; el esquema Zod y el tipo salen de aquí. */
export const OPERADORES_DE_CONDICION = ['igualdad', 'pertenencia', 'prefijo'] as const;

export type OperadorDeCondicion = (typeof OPERADORES_DE_CONDICION)[number];

export interface CondicionDeItem {
  readonly item: string;
  readonly operator: OperadorDeCondicion;
  readonly values: readonly string[];
}

export interface DestinoDeItem {
  readonly entity: string;
  readonly field?: string;
  readonly match?: Readonly<Record<string, string>>;
}

/** Ítem de `datos-criticos.json` (forma de L1D-93; el validador del arranque ya la comprobó). */
export interface ItemDeDatoCritico {
  readonly key: string;
  /** `label.es` del catálogo: texto versionado, nunca un valor del paciente. */
  readonly label: string;
  readonly cancerType: string;
  readonly destination: DestinoDeItem;
  readonly condition?: CondicionDeItem;
  readonly whenConditionUnknown?: 'faltante' | 'no_aplica';
  readonly minValues: number;
}

/** Los ítems de un tipo de cáncer y los estados de revisión que cuentan como verificados (RN-22). */
export interface DatosCriticosDeUnTipo {
  readonly items: readonly ItemDeDatoCritico[];
  readonly verifiedReviewStatuses: readonly string[];
}

/** El catálogo de datos críticos montado: se lee del `CLINICAL_CATALOG_PATH`, nunca del código. */
export interface CatalogoDeDatosCriticos {
  version(): string;
  deTipo(cancerType: string): DatosCriticosDeUnTipo | undefined;
}

export type ValorDeColumna = string | number | boolean | null;

/** De dónde viene el registro: método de entrada, documento de origen y página del fragmento (sin su texto, RN-10). */
export interface ProcedenciaDelRegistro {
  readonly entryMethod: string;
  readonly sourceDocumentId: string | null;
  readonly page: number | null;
}

/** Un registro clínico del paciente, reducido a lo que el cálculo necesita. */
export interface RegistroDeDato {
  readonly id: string;
  readonly reviewStatus: string;
  /** Fecha de observación o de examen (`YYYY-MM-DD`); `null` si el registro no tiene fecha. */
  readonly fecha: string | null;
  /** Instante de creación en ISO UTC con microsegundos: ordena por texto igual que por tiempo. */
  readonly creadoEn: string;
  readonly procedencia: ProcedenciaDelRegistro;
  /** Columnas permitidas del modelo por nombre de columna; las de una relación llevan prefijo (`exam.exam_type`). */
  readonly columnas: Readonly<Record<string, ValorDeColumna>>;
}

export type RegistrosPorEntidad = Readonly<Record<string, readonly RegistroDeDato[]>>;

export interface RegistrosDeCompletitud {
  /** `true` si el paciente existe; no lee ningún dato clínico ni de `identity`. */
  existePaciente(patientId: string): Promise<boolean>;
  /**
   * Registros del paciente de cada entidad pedida SIN filtrar por estado de revisión: incluye `rechazado` y
   * `reemplazado`. Quien los use debe aplicar `registrosVigentes()` (RN-07) antes de contarlos. Del `Diagnosis`,
   * solo el activo.
   */
  registrosSinFiltrarPorRevision(
    patientId: string,
    entidades: readonly string[],
  ): Promise<RegistrosPorEntidad>;
}

/** Resultado del motor puro: el estado de cada ítem, sin procedencia. */
export interface EstadoDeItem {
  readonly key: string;
  readonly status: EstadoDelChecklist;
}

/** `regla` cuando el ítem no tiene registro que cuente (faltante o no_aplica). */
export type OrigenDelItem = 'documento' | 'manual' | 'correccion' | 'seed' | 'regla';

export interface ProcedenciaDelItem {
  readonly entryMethod: 'ocr' | 'manual' | 'manual_correction' | 'seed';
  readonly reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
  readonly sourceDocumentId: string | null;
  readonly page?: number;
}

export interface ItemDelChecklist {
  readonly key: string;
  readonly label: string;
  readonly status: EstadoDelChecklist;
  readonly origin: OrigenDelItem;
  /** `null` si y solo si el estado es `faltante` o `no_aplica`. */
  readonly provenance: ProcedenciaDelItem | null;
  /** `field` es `null` cuando el destino es la entidad entera (`PriorTreatment`). */
  readonly destination: { readonly entity: string; readonly field: string | null };
  /** La condición del catálogo que no se cumplió; no nula solo si el estado es `no_aplica`. */
  readonly condition: CondicionDeItem | null;
}

export interface ChecklistDelPaciente {
  readonly catalogVersion: string;
  /** `false` si el tipo del diagnóstico activo no está en `ENABLED_CANCER_TYPES` o no hay diagnóstico activo. */
  readonly cancerTypeEnabled: boolean;
  readonly items: readonly ItemDelChecklist[];
}

export interface CompletenessService {
  /** Lanza `PacienteNoEncontradoError` si el paciente no existe. */
  calcular(patientId: string): Promise<ChecklistDelPaciente>;
}
