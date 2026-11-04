import type { ManualEntryOptions } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import {
  CuerpoIncompletoError,
  GradacionIncoherenteError,
  ValorFueraDeCatalogoError,
} from './manual-entry.errores.js';
import type { ItemDeDatoCritico } from '../completeness/ports.js';
import type {
  CatalogoDeEscalas,
  DatosDelDiagnostico,
  FuenteDeOpciones,
  GradacionGuardada,
  SistemaDeGradacion,
} from './ports.js';

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

/** Lo que el cuerpo envió y condiciona qué se exige: el tipo de cáncer (habilitado) y un valor de escala sin escala. */
export interface ValoresEnviados {
  readonly cancerType?: string | undefined;
  readonly performanceValue?: number | undefined;
}

/** El diagnóstico que quedaría tras el registro (lo enviado más lo heredado del vigente y las gradaciones copiadas). */
export interface DiagnosticoResultante extends Pick<
  DatosDelDiagnostico,
  'cancerType' | 'stagingSystem' | 'performanceScale' | 'performanceValue'
> {
  readonly sistemasDeGradacion: readonly string[];
}

function valorDeEscalaFueraDeRango(
  escalas: CatalogoDeEscalas,
  escala: string | null,
  valor: number,
): boolean {
  const rango = escala === null ? undefined : escalas.rangoDeEscala(escala);
  return rango === undefined || valor < rango.minimo || valor > rango.maximo;
}

const noNulo = (valor: unknown): boolean => valor !== null;

/** Propiedades del diagnóstico resultante fuera del catálogo, en el orden en que se comprueban (nombres, nunca valores). */
function camposFueraDelCatalogo(
  { escalas, tiposHabilitados }: FuenteDeValoresValidos,
  enviados: ValoresEnviados,
  resultante: DiagnosticoResultante,
): string[] {
  const { cancerType: tipo, stagingSystem, performanceScale, performanceValue } = resultante;
  const exigeRango =
    performanceValue !== null &&
    (noNulo(performanceScale) || enviados.performanceValue !== undefined);
  const comprobaciones: readonly (readonly [string, boolean])[] = [
    ['cancerType', enviados.cancerType !== undefined && !tiposHabilitados.estaHabilitado(tipo)],
    [
      'stagingSystem',
      stagingSystem !== null && !escalas.sistemaDeEstadificacionValido(stagingSystem, tipo),
    ],
    [
      'performanceScale',
      performanceScale !== null && escalas.rangoDeEscala(performanceScale) === undefined,
    ],
    [
      'performanceValue',
      exigeRango && valorDeEscalaFueraDeRango(escalas, performanceScale, performanceValue),
    ],
    [
      'grading.gradingSystem',
      resultante.sistemasDeGradacion.some(
        (sistema) => !escalas.sistemaDeGradacionValido(sistema, tipo),
      ),
    ],
  ];
  return comprobaciones.filter(([, fuera]) => fuera).map(([campo]) => campo);
}

/**
 * Valida SIEMPRE el diagnóstico resultante contra el catálogo montado (decisión del Gate 2): una corrección que solo
 * cambia el tipo de cáncer o la escala no deja pasar lo heredado (estadificación, valor de escala, gradaciones copiadas).
 * Lo enviado solo decide si se exige que el tipo esté habilitado y si un valor sin escala es un error. Lanza
 * `ValorFueraDeCatalogoError` con el NOMBRE de la primera propiedad que falla, nunca su valor (RN-10).
 */
export function validarValoresDeCatalogo(
  fuente: FuenteDeValoresValidos,
  enviados: ValoresEnviados,
  resultante: DiagnosticoResultante,
): void {
  const [campo] = camposFueraDelCatalogo(fuente, enviados, resultante);
  if (campo !== undefined) throw new ValorFueraDeCatalogoError(campo);
}

const SISTEMAS_DE_GRADACION: readonly SistemaDeGradacion[] = ['nottingham', 'gleason_isup'];

const esSistemaDeGradacion = (sistema: string): sistema is SistemaDeGradacion =>
  SISTEMAS_DE_GRADACION.some((conocido) => conocido === sistema);

/** Primera aparición de cada clave, en el orden recibido. */
function sinRepetidos<T>(elementos: readonly T[], claveDe: (elemento: T) => string): T[] {
  const vistas = new Set<string>();
  return elementos.filter((elemento) => {
    const clave = claveDe(elemento);
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

/** Tipos del catálogo que el despliegue habilita (`ENABLED_CANCER_TYPES`, RN-20), en el orden del manifiesto. */
function tiposHabilitadosDelCatalogo(fuente: FuenteDeOpciones): readonly string[] {
  return fuente.tiposDelCatalogo.filter((tipo) => fuente.tiposHabilitados.estaHabilitado(tipo));
}

/** El tipo del diagnóstico vigente; sin vigente, todos los tipos habilitados. */
function tiposEnAlcance(fuente: FuenteDeOpciones, tipoDeCancer: string | null): readonly string[] {
  return tipoDeCancer === null ? tiposHabilitadosDelCatalogo(fuente) : [tipoDeCancer];
}

/** Términos de los biomarcadores del checklist y, tras ellos, los LOINC del catálogo; el checklist manda en la etiqueta. */
function terminosDeBiomarcador(
  fuente: FuenteDeOpciones,
  itemsCriticos: readonly ItemDeDatoCritico[],
  tipos: readonly string[],
): ManualEntryOptions['biomarkerTerms'] {
  const delChecklist = itemsCriticos.flatMap(({ destination, label }) =>
    destination.entity === 'Biomarker' && destination.match?.name !== undefined
      ? [{ term: destination.match.name, label }]
      : [],
  );
  const delCodigos = tipos
    .flatMap((tipo) => fuente.terminologia.entradas(tipo, 'loinc'))
    .map(({ terminoCanonico, etiquetaEs }) => ({ term: terminoCanonico, label: etiquetaEs }));
  return sinRepetidos([...delChecklist, ...delCodigos], ({ term }) => term);
}

function destinoDelItem({
  key,
  destination,
}: ItemDeDatoCritico): ManualEntryOptions['criticalItems'][number] {
  const esBiomarcador = destination.entity === 'Biomarker';
  return {
    item: key,
    entity: destination.entity as ManualEntryOptions['criticalItems'][number]['entity'],
    field: destination.field ?? null,
    term: esBiomarcador ? (destination.match?.name ?? null) : null,
  };
}

/**
 * Valores del catálogo para los formularios de registro manual (RN-29), para el tipo del diagnóstico vigente o, si no
 * hay, para todos los tipos habilitados. Los ítems críticos salen del MISMO lector de `datos-criticos.json` que el
 * checklist (D10): `criticalItems` y `CompletenessItem.destination` no pueden divergir.
 */
export function opcionesDeRegistroManual(
  fuente: FuenteDeOpciones,
  tipoDeCancer: string | null,
): ManualEntryOptions {
  const tipos = tiposEnAlcance(fuente, tipoDeCancer);
  const itemsCriticos = tipos.flatMap((tipo) => fuente.datosCriticos.deTipo(tipo)?.items ?? []);
  const delTipo = (listar: (tipo: string) => readonly string[]): string[] => [
    ...new Set(tipos.flatMap(listar)),
  ];
  return {
    catalogVersion: fuente.escalas.version(),
    cancerType: tipoDeCancer,
    enabledCancerTypes: [...tiposHabilitadosDelCatalogo(fuente)],
    biomarkerTerms: terminosDeBiomarcador(fuente, itemsCriticos, tipos),
    stagingSystems: delTipo((tipo) => fuente.escalas.sistemasDeEstadificacion(tipo)),
    performanceScales: fuente.escalas
      .escalasFuncionales()
      .map(({ codigo, minimo, maximo }) => ({ code: codigo, minimum: minimo, maximum: maximo })),
    gradingSystems: delTipo((tipo) => fuente.escalas.sistemasDeGradacion(tipo)).filter(
      esSistemaDeGradacion,
    ),
    criticalItems: sinRepetidos(itemsCriticos.map(destinoDelItem), ({ item }) => item),
  };
}

/** Propiedad del cuerpo (`field` del 422) que causó el error de dominio; `undefined` si no es de un campo (p. ej. paciente egresado). Nunca el valor (RN-10). */
export function campoDelError(error: unknown): string | undefined {
  // Los campos anidados (`grading.gradingSystem`) se informan por la propiedad de primer nivel del contrato.
  if (error instanceof ValorFueraDeCatalogoError) return error.campo.split('.')[0];
  if (error instanceof GradacionIncoherenteError) return 'grading';
  if (error instanceof CuerpoIncompletoError) return error.campo;
  return undefined;
}
