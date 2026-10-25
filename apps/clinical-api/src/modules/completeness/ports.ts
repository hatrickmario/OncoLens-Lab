/** Estado de cada dato crítico en el checklist (FR-23). */
export type EstadoDelChecklist =
  'presente_verificado' | 'presente_sin_verificar' | 'faltante' | 'no_aplica';

export type OperadorDeCondicion = 'igualdad' | 'pertenencia' | 'prefijo';

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

/** Un registro clínico del paciente, reducido a lo que el cálculo necesita. */
export interface RegistroDeDato {
  readonly id: string;
  readonly reviewStatus: string;
  /** Fecha de observación o de examen (`YYYY-MM-DD`); `null` si el registro no tiene fecha. */
  readonly fecha: string | null;
  /** Instante de creación en ISO UTC con microsegundos: ordena por texto igual que por tiempo. */
  readonly creadoEn: string;
  /** Columnas permitidas del modelo por nombre de columna; las de una relación llevan prefijo (`exam.exam_type`). */
  readonly columnas: Readonly<Record<string, ValorDeColumna>>;
}

export type RegistrosPorEntidad = Readonly<Record<string, readonly RegistroDeDato[]>>;

export interface RegistrosDeCompletitud {
  /** Registros del paciente de cada entidad pedida; del `Diagnosis`, solo el activo. */
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

export interface ItemDelChecklist {
  readonly key: string;
  readonly status: EstadoDelChecklist;
}

export interface ChecklistDelPaciente {
  readonly catalogVersion: string;
  readonly items: readonly ItemDelChecklist[];
}

export interface CompletenessService {
  calcular(patientId: string): Promise<ChecklistDelPaciente>;
}
