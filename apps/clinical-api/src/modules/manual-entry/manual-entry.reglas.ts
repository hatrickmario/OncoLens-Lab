import type { DatosDelDiagnostico, GradacionGuardada } from './ports.js';

/** Campos de la corrección que el cuerpo del contrato puede traer (sin `grading`, que se trata aparte). */
export interface CamposDeCorreccion {
  readonly cancerType?: string | undefined;
  readonly histology?: string | null | undefined;
  readonly stagingSystem?: string | undefined;
  readonly stageValue?: string | undefined;
  readonly performanceScale?: string | undefined;
  readonly performanceValue?: number | undefined;
  readonly diagnosedAt?: string | undefined;
}

/** Puntaje de Gleason y grupo ISUP derivados de los patrones (DEC-05). Única fuente de la regla. */
export function derivarGleason(
  patronPrimario: number,
  patronSecundario: number,
): { readonly puntaje: number; readonly grupoIsup: number } {
  throw new Error(`no implementado: ${patronPrimario}${patronSecundario}`);
}

/** Campo incoherente del score o grupo ISUP enviados frente a los patrones; `null` si cuadran o no se enviaron. */
export function validarCoherenciaGleason(entrada: {
  readonly patronPrimario: number;
  readonly patronSecundario: number;
  readonly puntaje?: number | undefined;
  readonly grupoIsup?: number | undefined;
}): 'gleasonScore' | 'isupGradeGroup' | null {
  throw new Error(`no implementado: ${entrada.patronPrimario}`);
}

/** Texto canónico de `Diagnosis.grade` derivado de la gradación de referencia (DEC-05). */
export function textoDeGrado(
  gradacion: Pick<
    GradacionGuardada,
    'gradingSystem' | 'nottinghamGrade' | 'gleasonPrimaryPattern' | 'gleasonSecondaryPattern'
  >,
): string {
  throw new Error(`no implementado: ${gradacion.gradingSystem}`);
}

/** Gradación de referencia (DEC-05); `undefined` si ninguna está verificada. */
export function elegirGradacionDeReferencia<T extends GradacionGuardada>(
  gradaciones: readonly T[],
): T | undefined {
  throw new Error(`no implementado: ${gradaciones.length}`);
}

/** Valores del diagnóstico nuevo: los enviados ganan y los demás se copian del vigente (RN-08). */
export function fusionarCorreccion(
  vigente: DatosDelDiagnostico,
  cuerpo: CamposDeCorreccion,
): DatosDelDiagnostico {
  throw new Error(`no implementado: ${vigente.cancerType}${cuerpo.cancerType ?? ''}`);
}
