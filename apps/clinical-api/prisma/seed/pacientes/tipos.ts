import type { GradacionDeReferencia } from '../grade.js';

/**
 * Datos de un paciente semilla con TÉRMINOS CANÓNICOS: ningún código (RN-27). Los códigos los resuelve el catálogo
 * versionado al sembrar. Las fechas son "días antes de la fecha de referencia" (reloj inyectado, sin `Date.now()`).
 */

export type GradacionSemilla = GradacionDeReferencia & {
  /** Solo Gleason: tipo de muestra y alcance (data-model §6). */
  readonly muestra?: {
    readonly specimenType: 'biopsia' | 'prostatectomia';
    readonly gradeScope: string;
  };
};

export interface DiagnosticoSemilla {
  readonly clave: string;
  readonly cancerType: 'mama' | 'prostata';
  readonly histology: string;
  readonly stagingSystem: string;
  readonly stageValue: string;
  readonly performanceScale: 'ECOG';
  readonly performanceValue: number;
  readonly diasDesdeElDiagnostico: number;
  readonly activo: boolean;
  /** Gradación de referencia; de ella se DERIVA `Diagnosis.grade` (DEC-05), nunca se escribe a mano. */
  readonly gradacion?: GradacionSemilla;
}

export interface BiomarcadorSemilla {
  readonly clave: string;
  readonly nombre: string;
  readonly valor: string;
  readonly unidad: string | null;
  readonly tipoResultado: 'cuantitativo' | 'cualitativo';
  readonly significadoClinico: 'normal' | 'alterado' | 'relevante';
  /** Por defecto `verificado`, como todo dato sembrado; FX-T3-a (paciente (f)) lo deja `requiere_revision` (RN-26). */
  readonly estadoDeRevision?: 'verificado' | 'requiere_revision';
  /**
   * Biomarcador (`examen` y `clave`) con el que este dato entra en conflicto (`conflicts_with_id`, RN-08): ese examen va
   * antes en la lista del paciente, porque la clave foránea exige que la fila ya exista.
   */
  readonly enConflictoCon?: { readonly examen: string; readonly biomarcador: string };
}

export interface ExamenSemilla {
  readonly clave: string;
  readonly tipo: string;
  readonly diasAntes: number;
  readonly biomarcadores: readonly BiomarcadorSemilla[];
}

/** Motivo de fin de una línea (subconjunto del enum `end_reason` de data-model.md). */
export type MotivoDeFinSemilla = 'progresion' | 'toxicidad' | 'completado';

export interface TratamientoPreviaSemilla {
  readonly clave: string;
  readonly numeroDeLinea: number;
  readonly setting: string;
  /** Nombre del régimen tal como se muestra; sin `farmacos` el catálogo ATC lo resuelve entero (RN-27). */
  readonly regimen: string;
  /**
   * Términos canónicos de cada fármaco de una combinación: el catálogo ATC resuelve cada uno y `atc_codes` lleva los
   * que encuentra; el régimen solo queda `mapeado` si todos resuelven (RN-27, nunca un código escrito a mano).
   */
  readonly farmacos?: readonly string[];
  readonly diasDesdeElInicio: number;
  /** Sin `fin` la línea sigue en curso (`ongoing = true`, `ended_at = null`, `end_reason = desconocido`). */
  readonly fin?: { readonly diasAntes: number; readonly motivo: MotivoDeFinSemilla };
}

export interface EventoSemilla {
  readonly clave: string;
  readonly tipo: 'cirugia' | 'recaida' | 'progresion' | 'respuesta';
  readonly diasAntes: number;
  readonly descripcion: string;
  /** Clave del tratamiento previo cuyo fin marca este evento (`prior_treatment_id`); sin ella, `null`. */
  readonly cierraLinea?: string;
}

export interface AtributoSemilla {
  readonly clave: string;
  readonly atributo: string;
  readonly valor: string;
  readonly diasAntes: number;
}

/** Nota clínica sintética SIN PII (US-253, P-3): se siembra para la demo de la corrección con histórico. */
export interface NotaSemilla {
  readonly clave: string;
  readonly tipo: 'antecedente' | 'comorbilidad' | 'alergia' | 'antecedente_familiar' | 'nota_libre';
  readonly texto: string;
  readonly diasAntes: number;
}

export interface PacienteSemilla {
  readonly clave: string;
  readonly anioDeNacimiento: number;
  readonly sexo: 'F' | 'M';
  readonly diagnosticos: readonly DiagnosticoSemilla[];
  readonly examenes: readonly ExamenSemilla[];
  readonly tratamientosPrevios: readonly TratamientoPreviaSemilla[];
  readonly eventos: readonly EventoSemilla[];
  readonly atributos: readonly AtributoSemilla[];
  /** Notas clínicas sintéticas sin PII (solo el paciente (a): la demo de la corrección, US-253). */
  readonly notas?: readonly NotaSemilla[];
  /** Referencia sintética del opt-out de `analisis_ia` (solo el paciente (d)). */
  readonly optOutAnalisisIa?: string;
}
