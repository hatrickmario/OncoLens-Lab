import { v5 as uuidV5 } from 'uuid';
import type { EstadoDeRevisionVisible } from '../compartido/estados-de-revision.js';
import type {
  BiomarcadorLeido,
  ConfianzaDeExtraccion,
  DatosDelCaso,
  DiagnosticoLeido,
  EventoClinicoLeido,
  EventoDelTimeline,
  ProcedenciaDeFila,
  RegistroDeIaLeido,
  SerieDelCaso,
  TratamientoPrevioLeido,
} from './ports.js';

/**
 * Reglas puras de la vista de caso (sin E/S): derivación de los eventos del timeline (ADR-32), su orden (D5), el `id`
 * determinista de cada evento derivado (D4) y la procedencia de un examen (D6). Excluir `rechazado`/`reemplazado` no
 * es de este archivo: lo hace el SQL con `sqlDatoVigente()` (D9).
 */

/** Los literales de `eventType` y las descripciones de los eventos derivados (D3): su único dueño. */
export const TIPOS_DE_EVENTO = {
  diagnostico: 'diagnostico',
  inicioDeTratamiento: 'inicio_tratamiento_previo',
  finDeTratamiento: 'fin_tratamiento_previo',
  examen: 'examen',
  analisisDeIa: 'analisis_ia',
  resumenDelCaso: 'resumen_caso',
} as const;

/** `eventType` de los eventos que salen de un `AIAnalysisRecord` (D7, `[S5 resp. 11a]`): la UI los rotula «Generado por IA». */
export const TIPOS_DE_EVENTO_DE_IA = [
  TIPOS_DE_EVENTO.analisisDeIa,
  TIPOS_DE_EVENTO.resumenDelCaso,
] as const;

export const DESCRIPCION_DEL_ANALISIS = 'Análisis de IA';
export const DESCRIPCION_DEL_RESUMEN = 'Resumen del caso';

/** Espacio de nombres del `uuid` v5 de los eventos derivados: fijo, de este módulo (D4). */
const ESPACIO_DE_NOMBRES_DEL_TIMELINE = '6f2b7a10-3e4c-4d58-a1b9-74c45e000001';

/** Rango del origen para desempatar eventos de la misma fecha (D5): diagnóstico → inicio → fin → examen → evento clínico → IA. */
const RANGO = {
  diagnostico: 0,
  inicioDeTratamiento: 1,
  finDeTratamiento: 2,
  examen: 3,
  eventoClinico: 4,
  analisisDeIa: 5,
  resumenDelCaso: 6,
} as const;

/** Evento del timeline con las claves de orden que el contrato no expone (D5). */
export interface EventoConOrden {
  readonly evento: EventoDelTimeline;
  readonly rangoDelOrigen: number;
  readonly creadoEn: string;
}

/** `id` estable entre llamadas para un evento que no es una fila (D4): un tratamiento previo produce inicio y fin. */
export function idDeEventoDerivado(origen: string, idDeLaFila: string, hito: string): string {
  return uuidV5(`${origen}:${idDeLaFila}:${hito}`, ESPACIO_DE_NOMBRES_DEL_TIMELINE);
}

/** Cuánto pesa cada estado en la procedencia de un examen (D6): 0 = el más pendiente. */
const PENDIENCIA_DEL_ESTADO: Record<EstadoDeRevisionVisible, number> = {
  requiere_revision: 0,
  auto_aceptado: 1,
  corregido: 2,
  verificado: 3,
};
const CONFIANZAS_DE_MENOR_A_MAYOR: readonly ConfianzaDeExtraccion[] = ['baja', 'media', 'alta'];

function elMasPendiente(estados: readonly EstadoDeRevisionVisible[]): EstadoDeRevisionVisible {
  return estados.reduce((masPendiente, estado) =>
    PENDIENCIA_DEL_ESTADO[estado] < PENDIENCIA_DEL_ESTADO[masPendiente] ? estado : masPendiente,
  );
}

function laConfianzaMasBaja(confianzas: readonly ConfianzaDeExtraccion[]): ConfianzaDeExtraccion {
  const conValor = confianzas.filter((confianza) => confianza !== 'n_a');
  if (conValor.length === 0) return 'n_a';
  const rangos = conValor.map((confianza) => CONFIANZAS_DE_MENOR_A_MAYOR.indexOf(confianza));
  return CONFIANZAS_DE_MENOR_A_MAYOR[Math.min(...rangos)] ?? 'n_a';
}

/**
 * Procedencia de un examen (D6; la tabla `exam` no tiene revisión): método y documento del examen, el estado más
 * pendiente y la confianza más baja de sus biomarcadores vigentes, y conflicto si alguno lo tiene. Precondición: al
 * menos un biomarcador vigente (un examen sin ellos no produce evento).
 */
export function procedenciaDeExamen(biomarcadores: readonly BiomarcadorLeido[]): ProcedenciaDeFila {
  const [primero] = biomarcadores;
  if (primero === undefined) throw new Error('examen_sin_biomarcadores_vigentes');
  return {
    entryMethod: primero.examEntryMethod,
    extractionConfidence: laConfianzaMasBaja(biomarcadores.map((b) => b.extractionConfidence)),
    reviewStatus: elMasPendiente(biomarcadores.map((b) => b.reviewStatus)),
    conflict: biomarcadores.some((b) => b.conflict),
    sourceDocumentId: primero.examSourceDocumentId,
  };
}

/** Procedencia de un dato de la vista: nunca lleva fuentes adicionales en la vista mínima (D8). Única conversión, usada por el timeline, las series y el service. */
export function procedenciaDelContrato(
  procedencia: ProcedenciaDeFila,
): EventoDelTimeline['provenance'] {
  return { ...procedencia, additionalSourceDocumentIds: [] };
}

/** Relleno técnico de un registro de IA (D7): el origen visible lo decide `eventType`, no esta procedencia. */
const PROCEDENCIA_DE_IA: ProcedenciaDeFila = {
  entryMethod: 'manual',
  extractionConfidence: 'n_a',
  reviewStatus: 'auto_aceptado',
  conflict: false,
  sourceDocumentId: null,
};

const SIN_CODIGOS = { icd10: null, cups: null } as const;

interface DatosDeUnEvento {
  readonly id: string;
  readonly eventType: string;
  readonly derived: boolean;
  readonly eventDate: string | null;
  readonly description: string;
  readonly codes: EventoDelTimeline['codes'];
  readonly procedencia: ProcedenciaDeFila;
  readonly rango: number;
  readonly creadoEn: string;
  /** Solo los eventos clínicos traen su propia precisión; los derivados son `dia`, o `incierta` si no tienen fecha. */
  readonly datePrecision?: EventoDelTimeline['datePrecision'];
}

/** Un evento sin fecha confiable sale siempre con `eventDate = null` e `incierta`, sea cual sea la precisión guardada. */
function comoEventoConOrden(datos: DatosDeUnEvento): EventoConOrden {
  const incierta = datos.eventDate === null || datos.datePrecision === 'incierta';
  return {
    evento: {
      id: datos.id,
      eventType: datos.eventType,
      derived: datos.derived,
      eventDate: incierta ? null : datos.eventDate,
      datePrecision: incierta ? 'incierta' : (datos.datePrecision ?? 'dia'),
      description: datos.description,
      codes: datos.codes,
      provenance: procedenciaDelContrato(datos.procedencia),
    },
    rangoDelOrigen: datos.rango,
    creadoEn: datos.creadoEn,
  };
}

function eventoDeDiagnostico(diagnostico: DiagnosticoLeido): EventoConOrden {
  return comoEventoConOrden({
    id: idDeEventoDerivado('diagnosis', diagnostico.id, 'diagnostico'),
    eventType: TIPOS_DE_EVENTO.diagnostico,
    derived: true,
    eventDate: diagnostico.diagnosedAt,
    description: diagnostico.histology,
    codes: { icd10: diagnostico.icd10Code, cups: null },
    procedencia: diagnostico.procedencia,
    rango: RANGO.diagnostico,
    creadoEn: diagnostico.createdAt,
  });
}

function eventosDeTratamiento(tratamiento: TratamientoPrevioLeido): EventoConOrden[] {
  const comun = {
    derived: true,
    description: tratamiento.regimenName,
    codes: { icd10: null, cups: tratamiento.cupsCode },
    procedencia: tratamiento.procedencia,
    creadoEn: tratamiento.createdAt,
  };
  const inicio = comoEventoConOrden({
    ...comun,
    id: idDeEventoDerivado('prior_treatment', tratamiento.id, 'inicio'),
    eventType: TIPOS_DE_EVENTO.inicioDeTratamiento,
    eventDate: tratamiento.startedAt,
    rango: RANGO.inicioDeTratamiento,
  });
  if (tratamiento.endedAt === null) return [inicio];
  const fin = comoEventoConOrden({
    ...comun,
    id: idDeEventoDerivado('prior_treatment', tratamiento.id, 'fin'),
    eventType: TIPOS_DE_EVENTO.finDeTratamiento,
    eventDate: tratamiento.endedAt,
    rango: RANGO.finDeTratamiento,
  });
  return [inicio, fin];
}

/** Un evento por examen con al menos un biomarcador vigente; su procedencia sale de todos ellos (D6). */
function eventosDeExamen(biomarcadores: readonly BiomarcadorLeido[]): EventoConOrden[] {
  const porExamen = new Map<string, BiomarcadorLeido[]>();
  for (const biomarcador of biomarcadores) {
    porExamen.set(biomarcador.examId, [...(porExamen.get(biomarcador.examId) ?? []), biomarcador]);
  }
  return [...porExamen.values()].flatMap((delExamen) => {
    const [primero] = delExamen;
    if (primero === undefined) return [];
    return [
      comoEventoConOrden({
        id: idDeEventoDerivado('exam', primero.examId, 'examen'),
        eventType: TIPOS_DE_EVENTO.examen,
        derived: true,
        eventDate: primero.performedAt,
        description: primero.examType,
        codes: SIN_CODIGOS,
        procedencia: procedenciaDeExamen(delExamen),
        rango: RANGO.examen,
        creadoEn: primero.examCreatedAt,
      }),
    ];
  });
}

function eventoDeIa(registro: RegistroDeIaLeido): EventoConOrden {
  const esAnalisis = registro.analysisType === 'analisis_evidencia';
  return comoEventoConOrden({
    id: idDeEventoDerivado('ai_analysis_record', registro.id, esAnalisis ? 'analisis' : 'resumen'),
    eventType: esAnalisis ? TIPOS_DE_EVENTO.analisisDeIa : TIPOS_DE_EVENTO.resumenDelCaso,
    derived: true,
    eventDate: registro.fecha,
    description: esAnalisis ? DESCRIPCION_DEL_ANALISIS : DESCRIPCION_DEL_RESUMEN,
    codes: SIN_CODIGOS,
    procedencia: PROCEDENCIA_DE_IA,
    rango: esAnalisis ? RANGO.analisisDeIa : RANGO.resumenDelCaso,
    creadoEn: registro.createdAt,
  });
}

/** Los eventos que se derivan de entidades con tabla propia (ADR-32); nunca se guardan como `ClinicalEvent`. */
export function eventosDerivados(datos: DatosDelCaso): EventoConOrden[] {
  return [
    ...datos.diagnosticos.map(eventoDeDiagnostico),
    ...datos.tratamientos.flatMap(eventosDeTratamiento),
    ...eventosDeExamen(datos.biomarcadores),
    ...datos.registrosDeIa.map(eventoDeIa),
  ];
}

/** Los eventos que sí viven en `ClinicalEvent` (`progresion`, `toxicidad`, `cirugia`…), con su propio `id`. */
export function eventosClinicos(eventos: readonly EventoClinicoLeido[]): EventoConOrden[] {
  return eventos.map((fila) =>
    comoEventoConOrden({
      id: fila.id,
      eventType: fila.eventType,
      derived: false,
      eventDate: fila.eventDate,
      datePrecision: fila.datePrecision,
      description: fila.description,
      codes: { icd10: fila.icd10Code, cups: fila.cupsCode },
      procedencia: fila.procedencia,
      rango: RANGO.eventoClinico,
      creadoEn: fila.createdAt,
    }),
  );
}

/** Orden por unidades de código, igual en toda máquina: sin depender del `locale`. */
function compararTexto(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compararFechados(a: EventoConOrden, b: EventoConOrden): number {
  return (
    compararTexto(a.evento.eventDate ?? '', b.evento.eventDate ?? '') ||
    a.rangoDelOrigen - b.rangoDelOrigen ||
    compararTexto(a.evento.id, b.evento.id)
  );
}

function compararSinFecha(a: EventoConOrden, b: EventoConOrden): number {
  return compararTexto(a.creadoEn, b.creadoEn) || compararTexto(a.evento.id, b.evento.id);
}

/**
 * Orden del timeline (D5): los fechados por fecha ascendente (empate por rango del origen y luego por `id`) y, después
 * de todos, los `incierta` por creación e `id`. Determinista: dos lecturas dan el mismo orden.
 */
export function ordenarTimeline(eventos: readonly EventoConOrden[]): EventoDelTimeline[] {
  const fechados = eventos.filter((e) => e.evento.eventDate !== null).sort(compararFechados);
  const sinFecha = eventos.filter((e) => e.evento.eventDate === null).sort(compararSinFecha);
  return [...fechados, ...sinFecha].map((e) => e.evento);
}

function compararPuntos(a: BiomarcadorLeido, b: BiomarcadorLeido): number {
  return compararTexto(a.performedAt, b.performedAt) || compararTexto(a.biomarkerId, b.biomarkerId);
}

/**
 * Una serie por nombre de biomarcador (orden alfabético, D8), aunque tenga un solo punto: los puntos por fecha e `id`,
 * el código LOINC del más reciente y `additionalSourceDocumentIds = []` (las reglas de US-089 no aplican).
 */
export function seriesDeBiomarcadores(biomarcadores: readonly BiomarcadorLeido[]): SerieDelCaso[] {
  const porNombre = new Map<string, BiomarcadorLeido[]>();
  for (const biomarcador of biomarcadores) {
    porNombre.set(biomarcador.name, [...(porNombre.get(biomarcador.name) ?? []), biomarcador]);
  }
  return [...porNombre.entries()]
    .sort(([a], [b]) => compararTexto(a, b))
    .map(([name, delNombre]) => {
      const puntos = [...delNombre].sort(compararPuntos);
      return {
        name,
        loincCode: puntos[puntos.length - 1]?.loincCode ?? null,
        points: puntos.map((punto) => ({
          value: punto.value,
          unit: punto.unit,
          performedAt: punto.performedAt,
          provenance: procedenciaDelContrato({
            entryMethod: punto.examEntryMethod,
            extractionConfidence: punto.extractionConfidence,
            reviewStatus: punto.reviewStatus,
            conflict: punto.conflict,
            sourceDocumentId: punto.examSourceDocumentId,
          }),
        })),
      };
    });
}
