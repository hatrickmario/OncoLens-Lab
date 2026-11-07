/*
 * Glosario: «completeness» es el módulo y el endpoint (`/completeness`, `CompletenessService`); «completitud» es el
 * nombre en español del mismo concepto en comentarios y tests; «checklist» es el resultado (`ChecklistDelPaciente`,
 * los ítems por dato crítico). Un «faltante» es un ítem en estado `faltante` (`faltantesDe()`).
 */

/** Estado de cada dato crítico en el checklist (FR-23). */
export type EstadoDelChecklist =
  'presente_verificado' | 'presente_sin_verificar' | 'faltante' | 'no_aplica';

/**
 * Tipo de vacío de un dato crítico (US-263, `[S6 resp. 10]`): segundo eje sobre `EstadoDelChecklist`, que no cambia.
 * Mismo vocabulario que `gapType` de `CompletenessItem` y de `ChatCompletenessItem`.
 */
export const TIPOS_DE_VACIO = [
  'no_encontrado',
  'incompleto',
  'por_conciliar',
  'no_buscado',
] as const;

export type TipoDeVacio = (typeof TIPOS_DE_VACIO)[number];

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

/**
 * Declaración que el catálogo acepta como cumplimiento alternativo de un ítem (`satisfiedBy`, d5fb-04, RN-29): un
 * registro vigente de `entity` con esa clave y ese valor cumple el ítem aunque su destino no tenga filas (p. ej.
 * `sin_tratamiento_previo = si` cumple «Tratamientos previos»). Los nombres son los del catálogo.
 */
export interface DeclaracionQueCumple {
  readonly entity: string;
  readonly attribute_key: string;
  readonly value: string;
}

/** Cómo se cumplió un ítem presente: con registros en su destino o con una declaración de ausencia del catálogo. */
export type ResueltoPor = 'registro' | 'declaracion_de_ausencia';

/** Ítem de `datos-criticos.json` (forma de L1D-93; el validador del arranque ya la comprobó). */
export interface ItemDeDatoCritico {
  readonly key: string;
  /** `label.es` del catálogo: texto versionado, nunca un valor del paciente. */
  readonly label: string;
  readonly cancerType: string;
  readonly destination: DestinoDeItem;
  readonly condition?: CondicionDeItem;
  readonly whenConditionUnknown?: 'faltante' | 'no_aplica';
  /** Cumplimientos alternativos al destino; ausente en los ítems que solo se cumplen con registros. */
  readonly satisfiedBy?: readonly DeclaracionQueCumple[];
  readonly minValues: number;
  /** `document_type` en los que el catálogo espera encontrar el dato (`sourceDocumentTypes`, RN-29, US-263). */
  readonly sourceDocumentTypes: readonly string[];
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
  /** Los ids de `patientIds` que existen (una consulta para todos); no lee datos clínicos ni de `identity`. */
  existenPacientes(patientIds: readonly string[]): Promise<ReadonlySet<string>>;
  /**
   * Registros de los pacientes de cada entidad pedida SIN filtrar por estado de revisión: incluye `rechazado` y
   * `reemplazado`; quien los use debe aplicar `registrosVigentes()` (RN-07). Del `Diagnosis`, solo el activo. Una
   * consulta por entidad, agrupada por paciente. Todo id pedido aparece en el mapa (con `[]` en las entidades sin filas).
   */
  registrosVariosSinFiltrarPorRevision(
    patientIds: readonly string[],
    entidades: readonly string[],
  ): Promise<ReadonlyMap<string, RegistrosPorEntidad>>;
  /**
   * Registros con un conflicto pendiente (`review_status = requiere_revision` y `conflicts_with_id`, RN-08) de las
   * entidades pedidas que pueden tenerlo (`Diagnosis`, `Biomarker`), incluido un diagnóstico que no es el activo.
   * Todo id pedido aparece en el mapa (con `[]` en las entidades sin conflictos).
   */
  conflictosPendientes(
    patientIds: readonly string[],
    entidades: readonly string[],
  ): Promise<ReadonlyMap<string, RegistrosPorEntidad>>;
  /**
   * Los `document_type` de los documentos del paciente ya procesados (`ocr_status = completado`): solo estos cuentan como
   * «se buscó» (`[S6 resp. 10]`). Nunca ids ni nombres de documento (RN-10). Todo id pedido aparece en el mapa.
   */
  tiposDeDocumentoProcesados(
    patientIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReadonlySet<string>>>;
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
  /** Solo en un ítem presente con `satisfiedBy` en el catálogo; ausente en el resto (aditivo, ADR-26). */
  readonly resolvedBy?: ResueltoPor;
  /** Tipo de vacío (US-263); `null` si el ítem no tiene vacío. No cambia `status`. */
  readonly gapType: TipoDeVacio | null;
}

export interface ChecklistDelPaciente {
  readonly catalogVersion: string;
  /** `false` si el tipo del diagnóstico activo no está en `ENABLED_CANCER_TYPES` o no hay diagnóstico activo. */
  readonly cancerTypeEnabled: boolean;
  readonly items: readonly ItemDelChecklist[];
}

/**
 * Resultado del cálculo de un paciente dentro de un lote: el fallo de uno (`no_disponible`, con su error para quien
 * deba relanzarlo o registrar su clase) nunca afecta a los demás (RN-26).
 */
export type ResultadoDelChecklist =
  | { readonly estado: 'ok'; readonly checklist: ChecklistDelPaciente }
  | { readonly estado: 'no_disponible'; readonly error: unknown };

export interface CompletenessService {
  /** Lanza `PacienteNoEncontradoError` si el paciente no existe. Sin tipo de vacío: `gapType` es `null` en todo ítem. */
  calcular(patientId: string): Promise<ChecklistDelPaciente>;
}

/** El cálculo con el tipo de vacío de cada ítem (US-263): solo `/completeness` y el turno del chat lo piden. */
export interface CompletenessConTiposDeVacio {
  /** Lanza `PacienteNoEncontradoError` si el paciente no existe. Cada ítem trae su `gapType`. */
  calcularConTiposDeVacio(patientId: string): Promise<ChecklistDelPaciente>;
}

/** El cálculo por lotes (listado y búsqueda); aparte de `CompletenessService` para que quien solo calcula uno no lo implemente. */
export interface CompletenessEnLote {
  /** El checklist de cada paciente con la misma regla que `calcular`, con lecturas acotadas e independientes de su número. */
  calcularVarios(
    patientIds: readonly string[],
  ): Promise<ReadonlyMap<string, ResultadoDelChecklist>>;
}
