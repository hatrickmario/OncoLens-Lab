import type {
  Diagnosis,
  DiagnosisGrading,
  DiagnosisGradingInput,
  DiagnosisManualCreate,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { zDiagnosisManualCreate } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../mensajes';

export type SistemaDeGradacion = DiagnosisGradingInput['gradingSystem'];

/** Gradación tal como se escribe en el formulario: todo texto, `''` es «sin elegir». */
export interface FormularioDeGradacion {
  sistema: SistemaDeGradacion | '';
  nottingham: string;
  patronPrimario: string;
  patronSecundario: string;
  especimen: string;
  alcance: string;
}

export interface FormularioDeDiagnostico {
  cancerType: string;
  histology: string;
  stagingSystem: string;
  stageValue: string;
  performanceScale: string;
  performanceValue: string;
  diagnosedAt: string;
  gradacion: FormularioDeGradacion;
}

const GRADACION_VACIA: FormularioDeGradacion = {
  sistema: '',
  nottingham: '',
  patronPrimario: '',
  patronSecundario: '',
  especimen: '',
  alcance: '',
};

const texto = (valor: string | number | null | undefined): string => String(valor ?? '');

/** Gradación de referencia del diagnóstico vigente (la que deriva `grade`), si la hay. */
const gradacionDeReferencia = (vigente: Diagnosis | null): DiagnosisGrading | undefined =>
  vigente?.gradings.find((g) => g.isReference);

function formularioDeGradacion(
  referencia: DiagnosisGrading | undefined,
  sistemas: readonly string[],
): FormularioDeGradacion {
  const unico = sistemas.length === 1 ? (sistemas[0] as SistemaDeGradacion) : '';
  if (referencia === undefined) return { ...GRADACION_VACIA, sistema: unico };
  return {
    sistema: referencia.gradingSystem,
    nottingham: texto(referencia.nottinghamGrade),
    patronPrimario: texto(referencia.gleasonPrimaryPattern),
    patronSecundario: texto(referencia.gleasonSecondaryPattern),
    especimen: texto(referencia.specimenType),
    alcance: texto(referencia.gradeScope),
  };
}

/** Valores del diagnóstico vigente (o vacíos sin vigente) como punto de partida del formulario. */
export function formularioInicial(
  vigente: Diagnosis | null,
  sistemasDeGradacion: readonly string[],
): FormularioDeDiagnostico {
  return {
    cancerType: texto(vigente?.cancerType),
    histology: texto(vigente?.histology),
    stagingSystem: texto(vigente?.stagingSystem),
    stageValue: texto(vigente?.stageValue),
    performanceScale: texto(vigente?.performanceScale),
    performanceValue: texto(vigente?.performanceValue),
    diagnosedAt: texto(vigente?.diagnosedAt),
    gradacion: formularioDeGradacion(gradacionDeReferencia(vigente), sistemasDeGradacion),
  };
}

/** Gradación completa lista para enviar; `null` si no hay sistema o falta algún campo. `grade`, score e ISUP los deriva el servidor. */
export function gradacionCompleta(g: FormularioDeGradacion): DiagnosisGradingInput | null {
  if (g.sistema === 'nottingham') {
    return g.nottingham === ''
      ? null
      : { gradingSystem: 'nottingham', nottinghamGrade: Number(g.nottingham) };
  }
  if (g.sistema !== 'gleason_isup') return null;
  if ([g.patronPrimario, g.patronSecundario, g.especimen, g.alcance].includes('')) return null;
  return {
    gradingSystem: 'gleason_isup',
    specimenType: g.especimen as 'biopsia' | 'prostatectomia',
    gradeScope: g.alcance as 'nucleo_sitio' | 'peor' | 'global',
    gleasonPrimaryPattern: Number(g.patronPrimario),
    gleasonSecondaryPattern: Number(g.patronSecundario),
  };
}

/** Hay algo escrito en la gradación (más allá del sistema): incompleta si `gradacionCompleta` es `null`. */
const gradacionTocada = (g: FormularioDeGradacion): boolean =>
  [g.nottingham, g.patronPrimario, g.patronSecundario, g.especimen, g.alcance].some(
    (v) => v !== '',
  );

function gradacionCambiada(
  vigente: Diagnosis | null,
  g: FormularioDeGradacion,
): DiagnosisGradingInput | null {
  const nueva = gradacionCompleta(g);
  if (nueva === null) return null;
  const actual = gradacionCompleta(formularioDeGradacion(gradacionDeReferencia(vigente), []));
  return JSON.stringify(nueva) === JSON.stringify(actual) ? null : nueva;
}

/** `{ campo: nuevo }` solo si el valor escrito no está vacío y difiere del vigente; lo vacío nunca se envía. */
function siCambia<K extends keyof DiagnosisManualCreate>(
  campo: K,
  escrito: string,
  vigente: string,
): Partial<Record<K, string>> {
  const nuevo = escrito.trim();
  return nuevo === '' || nuevo === vigente ? {} : ({ [campo]: nuevo } as Record<K, string>);
}

/**
 * Cuerpo de `createManualDiagnosis` con solo lo que difiere del vigente (D4). Sin vigente, todo lo escrito. `grade` nunca
 * va: es derivado en `clinical-api` (D5). `{}` si no hay nada que enviar (el contrato exige al menos una propiedad).
 */
export function cambiosDelDiagnostico(
  vigente: Diagnosis | null,
  f: FormularioDeDiagnostico,
): DiagnosisManualCreate {
  const valorFuncional = f.performanceValue.trim();
  const grading = gradacionCambiada(vigente, f.gradacion);
  return {
    ...siCambia('cancerType', f.cancerType, texto(vigente?.cancerType)),
    ...siCambia('histology', f.histology, texto(vigente?.histology)),
    ...siCambia('stagingSystem', f.stagingSystem, texto(vigente?.stagingSystem)),
    ...siCambia('stageValue', f.stageValue, texto(vigente?.stageValue)),
    ...siCambia('performanceScale', f.performanceScale, texto(vigente?.performanceScale)),
    ...(valorFuncional !== '' &&
      Number(valorFuncional) !== vigente?.performanceValue && {
        performanceValue: Number(valorFuncional),
      }),
    ...siCambia('diagnosedAt', f.diagnosedAt, texto(vigente?.diagnosedAt)),
    ...(grading !== null && { grading }),
  };
}

/** Mínimos sin vigente (US-110 AC-6): tipo de cáncer, sistema y valor de estadio y fecha. */
const MINIMOS = ['cancerType', 'stagingSystem', 'stageValue', 'diagnosedAt'] as const;

/**
 * Validación de UX del formulario por propiedad del cuerpo (la que nombra también el `field` del servidor): mínimos sin
 * vigente, gradación a medias y el Zod del contrato sobre lo que se enviaría. El servidor vuelve a validar (D3).
 */
export function erroresDelDiagnostico(
  vigente: Diagnosis | null,
  f: FormularioDeDiagnostico,
): Record<string, string> {
  const { obligatorio, campoInvalido } = mensajes().registroManual.errores;
  const cambios = cambiosDelDiagnostico(vigente, f);
  const errores: Record<string, string> = {};
  if (vigente === null) {
    for (const campo of MINIMOS) if (f[campo].trim() === '') errores[campo] = obligatorio;
  }
  if (gradacionTocada(f.gradacion) && gradacionCompleta(f.gradacion) === null) {
    errores.grading = obligatorio;
  }
  const invalido = zDiagnosisManualCreate.safeParse(cambios);
  const campo = invalido.success ? undefined : invalido.error.issues[0]?.path[0];
  if (typeof campo === 'string' && errores[campo] === undefined) errores[campo] = campoInvalido;
  return errores;
}
