/*
 * Glosario: «normalización final» es la decisión de término canónico, código estándar y `mapping_status` de un dato
 * con códigos (RN-27, ADR-33); «propuesta» es lo que llega a decidir (formulario o, Post-MVP, Backend 2);
 * «decisión» es el resultado, que el service del consumidor guarda en su transacción.
 */

/** Estándares terminológicos del catálogo (`codigos.json`, `estandar`). */
export const ESTANDARES = ['cie10', 'loinc', 'atc', 'cups'] as const;
export type Estandar = (typeof ESTANDARES)[number];

/** Entidades clínicas con códigos que normaliza este servicio. */
export type EntidadNormalizable = 'Diagnosis' | 'Biomarker' | 'PriorTreatment' | 'ClinicalEvent';

/** Estado de mapeo persistido (`mapping_status`; `n_a` solo en `ClinicalEvent`). */
export type EstadoDeMapeo = 'mapeado' | 'no_mapeado' | 'n_a';

/** Tipos de `ClinicalEvent` (enum `event_type` del esquema). */
export type TipoDeEvento =
  'cirugia' | 'procedimiento' | 'respuesta' | 'progresion' | 'toxicidad' | 'recaida' | 'evolucion';

export interface PropuestaDeNormalizacion {
  readonly entidad: EntidadNormalizable;
  /** `null` = el paciente no tiene diagnóstico: no hay catálogo contra el que mapear y la decisión es `no_mapeado`. */
  readonly tipoDeCancer: string | null;
  /** Texto tal como lo escribió quien registra (dato clínico: nunca va a logs). */
  readonly textoOriginal: string;
  /** Código sugerido por el formulario o por Backend 2: solo se acepta si existe en el catálogo para su estándar. */
  readonly codigoPropuesto?: string;
  /** Obligatorio cuando `entidad = ClinicalEvent`. */
  readonly tipoDeEvento?: TipoDeEvento;
}

export interface DecisionDeNormalizacion {
  readonly entidad: EntidadNormalizable;
  /** Término canónico del catálogo si hubo mapeo; si no, el texto original. */
  readonly name: string;
  /** El texto tal como llegó. */
  readonly originalName: string;
  readonly mappingStatus: EstadoDeMapeo;
  readonly icd10Code: string | null;
  readonly loincCode: string | null;
  readonly cupsCode: string | null;
  readonly atcCodes: readonly string[];
  /** Versión del catálogo montado: la devuelve la decisión y no se persiste por fila (D5). */
  readonly catalogVersion: string;
}

/** Estado persistible de una entidad que no admite `n_a` (todas menos `ClinicalEvent`): UNA sola ruta de estrechamiento. */
export function estadoPersistible(decision: DecisionDeNormalizacion): 'mapeado' | 'no_mapeado' {
  throw new Error(`no implementado: ${decision.mappingStatus}`);
}

export interface ReconciliationService {
  decidir(propuesta: PropuestaDeNormalizacion): DecisionDeNormalizacion;
}

export interface EntradaDeCodigo {
  readonly terminoCanonico: string;
  readonly estandar: Estandar;
  readonly codigo: string;
  readonly nombreOficial: string;
  readonly etiquetaEs: string;
}

export interface SinonimosDeTermino {
  readonly terminoCanonico: string;
  readonly textos: readonly string[];
}

/** Puerto de lectura del catálogo terminológico montado (`CLINICAL_CATALOG_PATH`). Un tipo sin datos devuelve `[]`. */
export interface CatalogoTerminologico {
  version(): string;
  entradas(tipoDeCancer: string, estandar: Estandar): readonly EntradaDeCodigo[];
  sinonimos(tipoDeCancer: string): readonly SinonimosDeTermino[];
}
