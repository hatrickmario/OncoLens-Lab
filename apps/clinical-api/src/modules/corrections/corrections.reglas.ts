import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { ESTADOS_DESCARTADOS, type EstadoDeRevision } from '../compartido/estados-de-revision.js';
import { ValorFueraDeCatalogoError } from '../compartido/errores-de-registro.js';
import { armarTratamientoManual } from '../prior-treatments/prior-treatments.tratamiento.js';
import { motivoDeFinPersistido } from '../prior-treatments/prior-treatments.reglas.js';
import type { CuerpoDeTratamiento } from '../prior-treatments/prior-treatments.schema.js';
import { estadoPersistible, type DecisionDeNormalizacion } from '../reconciliation/ports.js';
import { CorreccionInvalidaError, DatoNoVigenteError } from './corrections.errores.js';
import type {
  AtributoActual,
  BiomarcadorActual,
  BiomarcadorCorregidoAGuardar,
  ExamenDeCorreccionAGuardar,
  NotaActual,
  PlanDeCorreccionDeAtributo,
  PlanDeCorreccionDeBiomarcador,
  PlanDeCorreccionDeNota,
  PlanDeCorreccionDeTratamiento,
  TipoDeNota,
  TratamientoActual,
} from './ports.js';

/** Cambios que el cuerpo de la corrección de un biomarcador propone (ausente = no cambia). */
export interface CambiosDeBiomarcador {
  readonly value: string;
  readonly unit?: string | null | undefined;
  readonly referenceRange?: string | null | undefined;
  readonly performedAt?: string | undefined;
}

export interface CambiosDeNota {
  readonly content?: string | undefined;
  readonly noteType?: TipoDeNota | undefined;
}

/** Reemplazo completo de los campos editables del tratamiento (ausente = nulo): el mismo cuerpo que el alta. */
export type CambiosDeTratamiento = CuerpoDeTratamiento;

/** La clave del atributo no cambia: solo el valor y, si se envía, la fecha de observación. */
export interface CambiosDeAtributo {
  readonly value: string;
  readonly observedAt?: string | undefined;
}

/** Quién, cuándo y con qué ids se crean las filas de la corrección (reloj e ids inyectados, sin `Date.now()`). */
export interface ContextoDeCorreccion {
  readonly patientId: string;
  readonly userId: string;
  readonly ahora: Date;
  readonly generarId: GeneradorDeIds;
}

/** Valor de un resultado cuantitativo: número con comparador y `%` opcionales (formato del dato, no su rango clínico). */
const VALOR_CUANTITATIVO = /^[<>≤≥]?\s*-?\d+(?:[.,]\d+)?\s*%?$/;

/** RN-08: solo se corrige un dato vigente; uno ya reemplazado o rechazado es `409` (concurrencia, D2). */
export function exigirDatoVigente(estado: EstadoDeRevision): void {
  if (ESTADOS_DESCARTADOS.includes(estado)) throw new DatoNoVigenteError();
}

/** «Hoy» del reloj inyectado, como fecha ISO `YYYY-MM-DD`. */
export function fechaDeHoy(ahora: Date): string {
  return ahora.toISOString().slice(0, 10);
}

/** Una fecha de examen posterior a hoy es `422` con `field = performedAt` (PRD §10). */
export function exigirFechaNoFutura(fecha: string | undefined, hoy: string): void {
  if (fecha !== undefined && fecha > hoy) throw new CorreccionInvalidaError('performedAt');
}

/** Un resultado cuantitativo debe ser numérico; cualquier otro texto es `VALOR_FUERA_DE_CATALOGO` con `field = value`. */
export function exigirValorDelFormatoDelResultado(
  tipo: BiomarcadorActual['resultType'],
  valor: string,
): void {
  if (tipo === 'cuantitativo' && !VALOR_CUANTITATIVO.test(valor.trim())) {
    throw new ValorFueraDeCatalogoError('value');
  }
}

/** El texto de una nota no puede quedar vacío ni superar `CLINICAL_NOTE_MAX_CHARS` (configuración, RN-22). */
export function exigirTextoDeNotaValido(contenido: string | undefined, maximo: number): void {
  if (contenido === undefined) return;
  if (contenido.trim().length === 0 || contenido.length > maximo) {
    throw new CorreccionInvalidaError('content');
  }
}

/** ¿La corrección cambia algún valor real del biomarcador? Una corrección idéntica no crea filas (D1). */
export function hayCambioRealDeBiomarcador(
  actual: BiomarcadorActual,
  cambios: CambiosDeBiomarcador,
): boolean {
  return (
    cambios.value !== actual.value ||
    (cambios.unit !== undefined && cambios.unit !== actual.unit) ||
    (cambios.referenceRange !== undefined &&
      (cambios.referenceRange ?? '') !== actual.referenceRange) ||
    (cambios.performedAt !== undefined && cambios.performedAt !== actual.performedAt)
  );
}

export function hayCambioRealDeNota(actual: NotaActual, cambios: CambiosDeNota): boolean {
  return (
    (cambios.content !== undefined && cambios.content !== actual.content) ||
    (cambios.noteType !== undefined && cambios.noteType !== actual.noteType)
  );
}

/**
 * Lo que una corrección de biomarcador debe cumplir antes de escribir (PRD §10), en un solo lugar: fecha no futura,
 * formato del valor y algún cambio real. Cada fallo es un `422` y no cambia nada.
 */
export function exigirCorreccionValidaDeBiomarcador(
  actual: BiomarcadorActual,
  cambios: CambiosDeBiomarcador,
  hoy: string,
): void {
  exigirFechaNoFutura(cambios.performedAt, hoy);
  exigirValorDelFormatoDelResultado(actual.resultType, cambios.value);
  if (!hayCambioRealDeBiomarcador(actual, cambios)) throw new CorreccionInvalidaError();
}

/** Lo mismo para la nota: texto no vacío ni mayor que `CLINICAL_NOTE_MAX_CHARS` y algún cambio real. */
export function exigirCorreccionValidaDeNota(
  actual: NotaActual,
  cambios: CambiosDeNota,
  maximoDeCaracteres: number,
): void {
  exigirTextoDeNotaValido(cambios.content, maximoDeCaracteres);
  if (!hayCambioRealDeNota(actual, cambios)) throw new CorreccionInvalidaError();
}

/**
 * `examenDeLaCorreccion()` (D3): la corrección cuelga siempre de un examen nuevo `manual_correction` (la procedencia de
 * un biomarcador vive en su examen), con la fecha enviada o la del anterior. Reemplaza al examen anterior solo si el
 * corregido era su único biomarcador vigente; si tenía otros, el anterior sigue vigente con ellos.
 */
export function examenDeLaCorreccion(
  actual: BiomarcadorActual,
  nuevaFecha: string | undefined,
  otrosVigentesEnElExamen: number,
  contexto: ContextoDeCorreccion,
): ExamenDeCorreccionAGuardar {
  return {
    id: contexto.generarId(),
    patientId: contexto.patientId,
    episodeId: actual.episodeId,
    examType: actual.examType,
    entryMethod: 'manual_correction',
    performedAt: nuevaFecha ?? actual.performedAt,
    supersedesId: otrosVigentesEnElExamen === 0 ? actual.examId : null,
    createdAt: contexto.ahora,
  };
}

/**
 * El biomarcador nuevo de la corrección (RN-08): verificado, con `supersedes_id` y la unidad y el rango anteriores si el
 * cuerpo no los envía. El término lo decide la normalización (RN-27): este módulo nunca asigna `mapping_status`.
 */
function biomarcadorCorregido(
  actual: BiomarcadorActual,
  cambios: CambiosDeBiomarcador,
  decision: DecisionDeNormalizacion,
  examenId: string,
  contexto: ContextoDeCorreccion,
): BiomarcadorCorregidoAGuardar {
  return {
    id: contexto.generarId(),
    examId: examenId,
    name: decision.name,
    originalName: actual.originalName,
    loincCode: decision.loincCode,
    mappingStatus: estadoPersistible(decision),
    value: cambios.value,
    unit: cambios.unit === undefined ? actual.unit : cambios.unit,
    referenceRange:
      cambios.referenceRange === undefined ? actual.referenceRange : (cambios.referenceRange ?? ''),
    resultType: actual.resultType,
    // Convención del dato manual (`[S5 resp. 13]`): relevante por regla, sin extracción ni texto fuente.
    clinicalSignificance: 'relevante',
    significanceSource: 'regla',
    extractionConfidence: 'n_a',
    reviewStatus: 'verificado',
    sourceSpan: '{}',
    supersedesId: actual.id,
    reviewedBy: contexto.userId,
    reviewedAt: contexto.ahora,
    createdAt: contexto.ahora,
  };
}

/** `planDeCorreccion()` del biomarcador (RN-08, ADR-50): qué filas se crean y cuál pasa a `reemplazado`. */
export function planDeCorreccionDeBiomarcador(
  actual: BiomarcadorActual,
  cambios: CambiosDeBiomarcador,
  decision: DecisionDeNormalizacion,
  otrosVigentesEnElExamen: number,
  contexto: ContextoDeCorreccion,
): PlanDeCorreccionDeBiomarcador {
  const examen = examenDeLaCorreccion(
    actual,
    cambios.performedAt,
    otrosVigentesEnElExamen,
    contexto,
  );
  return {
    examen,
    biomarcadorAReemplazar: actual.id,
    biomarcador: biomarcadorCorregido(actual, cambios, decision, examen.id, contexto),
  };
}

/** `planDeCorreccion()` de la nota (RN-08, D6): versión nueva activa con la fecha de la anterior; esta pasa a `reemplazado`. */
export function planDeCorreccionDeNota(
  actual: NotaActual,
  cambios: CambiosDeNota,
  contexto: ContextoDeCorreccion,
): PlanDeCorreccionDeNota {
  return {
    notaAReemplazar: actual.id,
    nota: {
      id: contexto.generarId(),
      patientId: contexto.patientId,
      episodeId: actual.episodeId,
      createdBy: contexto.userId,
      noteType: cambios.noteType ?? actual.noteType,
      entryMethod: 'manual_correction',
      content: cambios.content ?? actual.content,
      recordedAt: actual.recordedAt,
      isActive: true,
      extractionConfidence: 'n_a',
      reviewStatus: 'verificado',
      supersedesId: actual.id,
      createdAt: contexto.ahora,
    },
  };
}

/** ¿La corrección cambia algún campo real del tratamiento? Una corrección idéntica no crea filas (RN-08). */
export function hayCambioRealDeTratamiento(
  actual: TratamientoActual,
  cambios: CambiosDeTratamiento,
): boolean {
  return (
    (cambios.lineNumber ?? null) !== actual.lineNumber ||
    cambios.setting !== actual.setting ||
    cambios.regimenName !== actual.regimenName ||
    (cambios.startedAt ?? null) !== actual.startedAt ||
    (cambios.endedAt ?? null) !== actual.endedAt ||
    cambios.ongoing !== actual.ongoing ||
    motivoDeFinPersistido(cambios) !== actual.endReason
  );
}

export function exigirCorreccionValidaDeTratamiento(
  actual: TratamientoActual,
  cambios: CambiosDeTratamiento,
): void {
  if (!hayCambioRealDeTratamiento(actual, cambios)) throw new CorreccionInvalidaError();
}

export function hayCambioRealDeAtributo(
  actual: AtributoActual,
  cambios: CambiosDeAtributo,
): boolean {
  return (
    cambios.value !== actual.value ||
    (cambios.observedAt !== undefined && cambios.observedAt !== actual.observedAt)
  );
}

export function exigirCorreccionValidaDeAtributo(
  actual: AtributoActual,
  cambios: CambiosDeAtributo,
): void {
  if (!hayCambioRealDeAtributo(actual, cambios)) throw new CorreccionInvalidaError();
}

/**
 * `planDeCorreccion()` del tratamiento (RN-08, ADR-50): fila nueva con el esquema normalizado por la decisión
 * (RN-27, nunca por el cliente) y el mismo episodio; la anterior pasa a `reemplazado`.
 */
export function planDeCorreccionDeTratamiento(
  actual: TratamientoActual,
  cambios: CambiosDeTratamiento,
  decision: DecisionDeNormalizacion,
  contexto: ContextoDeCorreccion,
): PlanDeCorreccionDeTratamiento {
  const nuevo = armarTratamientoManual({
    cuerpo: cambios,
    decision,
    patientId: contexto.patientId,
    episodeId: actual.episodeId,
    ahora: contexto.ahora,
    generarId: contexto.generarId,
  });
  return {
    tratamientoAReemplazar: actual.id,
    tratamiento: { ...nuevo, entryMethod: 'manual_correction', supersedesId: actual.id },
  };
}

/** `planDeCorreccion()` del atributo: misma clave y episodio; sin fecha nueva conserva la anterior y su precisión. */
export function planDeCorreccionDeAtributo(
  actual: AtributoActual,
  cambios: CambiosDeAtributo,
  contexto: ContextoDeCorreccion,
): PlanDeCorreccionDeAtributo {
  const conFechaNueva = cambios.observedAt !== undefined;
  return {
    atributoAReemplazar: actual.id,
    atributo: {
      id: contexto.generarId(),
      patientId: contexto.patientId,
      episodeId: actual.episodeId,
      attributeKey: actual.attributeKey,
      value: cambios.value,
      observedAt: cambios.observedAt ?? actual.observedAt,
      datePrecision: conFechaNueva ? 'dia' : actual.datePrecision,
      entryMethod: 'manual_correction',
      extractionConfidence: 'n_a',
      reviewStatus: 'verificado',
      createdAt: contexto.ahora,
      supersedesId: actual.id,
    },
  };
}
