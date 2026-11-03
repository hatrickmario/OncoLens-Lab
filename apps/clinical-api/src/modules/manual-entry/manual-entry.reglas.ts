import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import { ValorFueraDeCatalogoError } from './manual-entry.errores.js';
import type { CatalogoDeEscalas, DatosDelDiagnostico, GradacionGuardada } from './ports.js';

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
  const puntaje = patronPrimario + patronSecundario;
  return { puntaje, grupoIsup: grupoIsupDe(puntaje, patronPrimario) };
}

function grupoIsupDe(puntaje: number, patronPrimario: number): number {
  if (puntaje <= 6) return 1;
  if (puntaje === 7) return patronPrimario === 3 ? 2 : 3;
  return puntaje === 8 ? 4 : 5;
}

/** Campo incoherente del score o grupo ISUP enviados frente a los patrones; `null` si cuadran o no se enviaron. */
export function validarCoherenciaGleason(entrada: {
  readonly patronPrimario: number;
  readonly patronSecundario: number;
  readonly puntaje?: number | undefined;
  readonly grupoIsup?: number | undefined;
}): 'gleasonScore' | 'isupGradeGroup' | null {
  const derivado = derivarGleason(entrada.patronPrimario, entrada.patronSecundario);
  if (entrada.puntaje !== undefined && entrada.puntaje !== derivado.puntaje) return 'gleasonScore';
  if (entrada.grupoIsup !== undefined && entrada.grupoIsup !== derivado.grupoIsup) {
    return 'isupGradeGroup';
  }
  return null;
}

/** Texto canónico de `Diagnosis.grade` derivado de la gradación de referencia (DEC-05). */
export function textoDeGrado(
  gradacion: Pick<
    GradacionGuardada,
    'gradingSystem' | 'nottinghamGrade' | 'gleasonPrimaryPattern' | 'gleasonSecondaryPattern'
  >,
): string {
  if (gradacion.gradingSystem === 'nottingham') {
    return `Nottingham grado ${gradacion.nottinghamGrade}`;
  }
  const primario = gradacion.gleasonPrimaryPattern ?? 0;
  const secundario = gradacion.gleasonSecondaryPattern ?? 0;
  const { puntaje, grupoIsup } = derivarGleason(primario, secundario);
  return `Gleason ${primario}+${secundario}=${puntaje} · ISUP ${grupoIsup}`;
}

const ESTADOS_VERIFICADOS: readonly string[] = ['verificado', 'corregido'];

/** 0 = prostatectomía `global`, 1 = biopsia `peor`, 2 = el resto (mama incluida: manda la recencia). */
function rangoDeReferencia(gradacion: GradacionGuardada): number {
  if (gradacion.specimenType === 'prostatectomia' && gradacion.gradeScope === 'global') return 0;
  if (gradacion.specimenType === 'biopsia' && gradacion.gradeScope === 'peor') return 1;
  return 2;
}

function compararReferencia(a: GradacionGuardada, b: GradacionGuardada): number {
  const porRango = rangoDeReferencia(a) - rangoDeReferencia(b);
  if (porRango !== 0) return porRango;
  const porFecha = b.createdAt.getTime() - a.createdAt.getTime();
  if (porFecha !== 0) return porFecha;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Gradación de referencia (DEC-05): solo entre las verificadas. Próstata: la prostatectomía `global`, si no la `peor` de
 * biopsia; mama: la más reciente. Desempate por fecha de alta descendente e `id`. `undefined` si ninguna está verificada.
 */
export function elegirGradacionDeReferencia<T extends GradacionGuardada>(
  gradaciones: readonly T[],
): T | undefined {
  return gradaciones
    .filter((g) => ESTADOS_VERIFICADOS.includes(g.reviewStatus))
    .sort(compararReferencia)[0];
}

/** Valores del diagnóstico nuevo: los enviados ganan y los demás se copian del vigente (RN-08). */
export function fusionarCorreccion(
  vigente: DatosDelDiagnostico,
  cuerpo: CamposDeCorreccion,
): DatosDelDiagnostico {
  return {
    ...vigente,
    cancerType: cuerpo.cancerType ?? vigente.cancerType,
    histology: cuerpo.histology === undefined ? vigente.histology : cuerpo.histology,
    stagingSystem: cuerpo.stagingSystem ?? vigente.stagingSystem,
    stageValue: cuerpo.stageValue ?? vigente.stageValue,
    performanceScale: cuerpo.performanceScale ?? vigente.performanceScale,
    performanceValue: cuerpo.performanceValue ?? vigente.performanceValue,
    diagnosedAt: cuerpo.diagnosedAt ?? vigente.diagnosedAt,
  };
}

/** Lo que `validarValoresDeCatalogo` consulta: `escalas.json` y los tipos de cáncer habilitados (RN-20, RN-29). */
export interface FuenteDeValoresValidos {
  readonly escalas: CatalogoDeEscalas;
  readonly tiposHabilitados: TiposDeCancerHabilitados;
}

/** Valores que el cuerpo envía y que deben pertenecer al catálogo (los no enviados no se revalidan). */
export interface ValoresAValidar extends CamposDeCorreccion {
  readonly gradingSystem?: string | undefined;
}

function valorDeEscalaFueraDeRango(
  escalas: CatalogoDeEscalas,
  escala: string | null,
  valor: number,
): boolean {
  const rango = escala === null ? undefined : escalas.rangoDeEscala(escala);
  return rango === undefined || valor < rango.minimo || valor > rango.maximo;
}

const enviado = (valor: unknown): boolean => valor !== undefined;

/** Propiedades del cuerpo cuyo valor está fuera del catálogo, en el orden en que se comprueban (nombres, nunca valores). */
function camposFueraDelCatalogo(
  { escalas, tiposHabilitados }: FuenteDeValoresValidos,
  valores: ValoresAValidar,
  resultante: Pick<DatosDelDiagnostico, 'cancerType' | 'performanceScale'>,
): string[] {
  const tipo = resultante.cancerType;
  const comprobaciones: readonly (readonly [string, boolean])[] = [
    ['cancerType', enviado(valores.cancerType) && !tiposHabilitados.estaHabilitado(tipo)],
    [
      'stagingSystem',
      enviado(valores.stagingSystem) &&
        !escalas.sistemaDeEstadificacionValido(valores.stagingSystem ?? '', tipo),
    ],
    [
      'performanceScale',
      enviado(valores.performanceScale) &&
        escalas.rangoDeEscala(valores.performanceScale ?? '') === undefined,
    ],
    [
      'performanceValue',
      valores.performanceValue !== undefined &&
        valorDeEscalaFueraDeRango(escalas, resultante.performanceScale, valores.performanceValue),
    ],
    [
      'grading.gradingSystem',
      enviado(valores.gradingSystem) &&
        !escalas.sistemaDeGradacionValido(valores.gradingSystem ?? '', tipo),
    ],
  ];
  return comprobaciones.filter(([, fuera]) => fuera).map(([campo]) => campo);
}

/**
 * `cancerType`, `stagingSystem`, `performanceScale`, su rango y el sistema de gradación contra el catálogo montado.
 * `resultante` es el diagnóstico que quedaría (los valores enviados o, si no, los del vigente). Lanza
 * `ValorFueraDeCatalogoError` con el NOMBRE de la primera propiedad que falla, nunca su valor (RN-10).
 */
export function validarValoresDeCatalogo(
  fuente: FuenteDeValoresValidos,
  valores: ValoresAValidar,
  resultante: Pick<DatosDelDiagnostico, 'cancerType' | 'performanceScale'>,
): void {
  const [campo] = camposFueraDelCatalogo(fuente, valores, resultante);
  if (campo !== undefined) throw new ValorFueraDeCatalogoError(campo);
}
