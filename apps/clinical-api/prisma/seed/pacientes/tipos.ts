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
  readonly escalaDeDesempeno: 'ECOG';
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
}

export interface ExamenSemilla {
  readonly clave: string;
  readonly tipo: string;
  readonly diasAntes: number;
  readonly biomarcadores: readonly BiomarcadorSemilla[];
}

export interface TratamientoPreviaSemilla {
  readonly clave: string;
  readonly numeroDeLinea: number;
  readonly setting: string;
  readonly regimen: string;
  readonly diasDesdeElInicio: number;
}

export interface EventoSemilla {
  readonly clave: string;
  readonly tipo: 'progresion';
  readonly diasAntes: number;
  readonly descripcion: string;
}

export interface AtributoSemilla {
  readonly clave: string;
  readonly atributo: string;
  readonly valor: string;
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
  /** Referencia sintética del opt-out de `analisis_ia` (solo el paciente (d)). */
  readonly optOutAnalisisIa?: string;
}
