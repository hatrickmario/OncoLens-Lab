import type { Provenance } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type {
  CasoClinico,
  FilaDeAtributo,
  FilaDeBiomarcador,
  FilaDeDiagnostico,
  FilaDeEvento,
  FilaDeTratamientoPrevio,
  ProcedenciaDeFila,
} from './evidence-analysis.repository.js';
import type { ContextoPermitido, EnlaceDeDato, MapaDeDataRefs } from './ports.js';

/** Valor que ocupa un campo obligatorio del contrato que el dato clínico no registra (RN-25: "No disponible"). */
export const NO_DISPONIBLE = 'No disponible';

/** Meses completos entre una fecha `AAAA-MM-DD` y `ahora`; `null` si la fecha es `null` (nunca negativo). */
export function mesesTranscurridos(fecha: string | null, ahora: Date): number | null {
  if (fecha === null) return null;
  const [anio = 0, mes = 0, dia = 0] = fecha.split('-').map(Number);
  const meses = (ahora.getUTCFullYear() - anio) * 12 + (ahora.getUTCMonth() + 1 - mes);
  const mesCompleto = ahora.getUTCDate() >= dia ? meses : meses - 1;
  return Math.max(0, mesCompleto);
}

/** Procedencia mínima del S1 (design 4): copia los ejes de la fila; el etiquetado completo es de RN-07 (US-065, S3). */
export function provenanceDe(fila: ProcedenciaDeFila): Provenance {
  return {
    entryMethod: fila.entryMethod,
    extractionConfidence: fila.extractionConfidence,
    reviewStatus: fila.reviewStatus,
    conflict: fila.conflictsWithId !== null,
  };
}

/** Referencias opacas `r1…rN` por petición (nunca un UUID) y el mapa que dice qué dato respalda cada una. */
export function asignarDataRefs(): {
  asignar(enlace: EnlaceDeDato): string;
  mapa: MapaDeDataRefs;
} {
  const mapa = new Map<string, EnlaceDeDato>();
  return {
    asignar(enlace) {
      const dataRef = `r${mapa.size + 1}`;
      mapa.set(dataRef, enlace);
      return dataRef;
    },
    mapa,
  };
}

type Asignador = ReturnType<typeof asignarDataRefs>;

function diagnosticoPermitido(
  fila: FilaDeDiagnostico | null,
  ahora: Date,
  asignador: Asignador,
): ContextoPermitido['diagnosis'] {
  if (fila === null) return null;
  return {
    dataRef: asignador.asignar({ tabla: 'diagnosis', id: fila.id }),
    cancerType: fila.cancerType,
    histology: fila.histology,
    grade: fila.grade,
    stagingSystem: fila.stagingSystem ?? NO_DISPONIBLE,
    stageValue: fila.stageValue ?? NO_DISPONIBLE,
    performanceScale: fila.performanceScale,
    performanceValue: fila.performanceValue,
    monthsSinceDiagnosis: mesesTranscurridos(fila.diagnosedAt, ahora) ?? 0,
    provenance: provenanceDe(fila),
  };
}

/** Más reciente primero por fecha del examen y, a igual fecha, por creación. */
function esMasReciente(candidato: FilaDeBiomarcador, actual: FilaDeBiomarcador): boolean {
  if (candidato.performedAt !== actual.performedAt) {
    return candidato.performedAt > actual.performedAt;
  }
  return candidato.createdAt > actual.createdAt;
}

function ultimoValorPorBiomarcador(filas: readonly FilaDeBiomarcador[]): FilaDeBiomarcador[] {
  const ultimos = new Map<string, FilaDeBiomarcador>();
  for (const fila of filas) {
    const actual = ultimos.get(fila.name);
    if (actual === undefined || esMasReciente(fila, actual)) ultimos.set(fila.name, fila);
  }
  return [...ultimos.values()];
}

function biomarcadorPermitido(
  fila: FilaDeBiomarcador,
  ahora: Date,
  asignador: Asignador,
): ContextoPermitido['biomarkers'][number] {
  return {
    dataRef: asignador.asignar({ tabla: 'biomarker', id: fila.id }),
    biomarkerName: fila.name,
    value: fila.value,
    resultType: fila.resultType,
    clinicalSignificance: fila.clinicalSignificance,
    monthsAgo: mesesTranscurridos(fila.performedAt, ahora) ?? 0,
    provenance: provenanceDe(fila),
  };
}

function atributoPermitido(
  fila: FilaDeAtributo,
  ahora: Date,
  asignador: Asignador,
): ContextoPermitido['attributes'][number] {
  return {
    dataRef: asignador.asignar({ tabla: 'clinical_attribute', id: fila.id }),
    key: fila.attributeKey,
    value: fila.value,
    monthsAgo: mesesTranscurridos(fila.observedAt, ahora),
    provenance: provenanceDe(fila),
  };
}

function tratamientoPermitido(
  fila: FilaDeTratamientoPrevio,
  ahora: Date,
  asignador: Asignador,
): ContextoPermitido['priorTreatments'][number] {
  return {
    dataRef: asignador.asignar({ tabla: 'prior_treatment', id: fila.id }),
    lineNumber: fila.lineNumber,
    setting: fila.setting,
    regimenName: fila.regimenName,
    atcCodes: [...fila.atcCodes],
    monthsSinceStart: mesesTranscurridos(fila.startedAt, ahora),
    monthsSinceEnd: mesesTranscurridos(fila.endedAt, ahora),
    endReason: fila.endReason,
    provenance: provenanceDe(fila),
  };
}

function eventoPermitido(
  fila: FilaDeEvento,
  ahora: Date,
  asignador: Asignador,
): ContextoPermitido['events'][number] {
  return {
    dataRef: asignador.asignar({ tabla: 'clinical_event', id: fila.id }),
    eventType: fila.eventType,
    monthsAgo: mesesTranscurridos(fila.eventDate, ahora),
    description: fila.description,
    provenance: provenanceDe(fila),
  };
}

/** Línea de tratamiento actual: la más alta entre los tratamientos en curso que tienen número de línea. */
function lineaActual(tratamientos: readonly FilaDeTratamientoPrevio[]): number | null {
  const lineas = tratamientos.flatMap((t) =>
    t.ongoing && t.lineNumber !== null ? [t.lineNumber] : [],
  );
  return lineas.length === 0 ? null : Math.max(...lineas);
}

/** Contexto sin ningún dato del paciente: lo que se guarda cuando no se envía nada a Backend 2 (`tipo_no_habilitado`). */
export function construirContextoVacio(
  population: CasoClinico['paciente']['population'],
): ContextoPermitido {
  return {
    population,
    diagnosis: null,
    biomarkers: [],
    clinicalNotes: [],
    currentLine: null,
    attributes: [],
    priorTreatments: [],
    events: [],
    biomarkerTrends: [],
    missingCriticalData: [],
    priorAnalyses: [],
  };
}

/**
 * Allowlist del contexto clínico (RN-10): arma cada objeto campo a campo desde las filas leídas, nunca copiando
 * entidades completas. Devuelve además qué dato respalda cada `dataRef`.
 */
export function construirContextoPermitido(
  caso: CasoClinico,
  ahora: Date,
): { contexto: ContextoPermitido; dataRefs: MapaDeDataRefs } {
  const asignador = asignarDataRefs();
  const contexto: ContextoPermitido = {
    population: caso.paciente.population,
    diagnosis: diagnosticoPermitido(caso.diagnosticoActivo, ahora, asignador),
    biomarkers: ultimoValorPorBiomarcador(caso.biomarcadores).map((fila) =>
      biomarcadorPermitido(fila, ahora, asignador),
    ),
    clinicalNotes: [],
    currentLine: lineaActual(caso.tratamientosPrevios),
    attributes: caso.atributos.map((fila) => atributoPermitido(fila, ahora, asignador)),
    priorTreatments: caso.tratamientosPrevios.map((fila) =>
      tratamientoPermitido(fila, ahora, asignador),
    ),
    events: caso.eventos.map((fila) => eventoPermitido(fila, ahora, asignador)),
    biomarkerTrends: [],
    missingCriticalData: [],
    priorAnalyses: [],
  };
  return { contexto, dataRefs: asignador.mapa };
}
