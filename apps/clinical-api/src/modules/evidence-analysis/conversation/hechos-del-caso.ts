import type { ConversationDataLink } from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  CaseFact,
  ClinicalContext,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { NO_DISPONIBLE, fechaConfiable } from '../clinical-context.builder.js';
import type { CasoClinico } from '../evidence-analysis.repository.js';
import type { EnlaceDeDato, MapaDeDataRefs } from '../ports.js';

/** Qué dato del paciente respalda un `factRef`: solo vive en Backend 1 durante el turno (nunca viaja a Backend 2). */
export type EnlaceDelHecho = Omit<ConversationDataLink, 'factRef'>;

export interface HechosDelCaso {
  caseFacts: CaseFact[];
  enlaces: ReadonlyMap<string, EnlaceDelHecho>;
}

type Procedencia = ClinicalContext['biomarkers'][number]['provenance'];

/** Un hecho antes de numerarlo: su clase, su texto y el dato del paciente que lo respalda. */
interface Candidato {
  dataRef: string;
  kind: string;
  verbalization: string;
  provenance: Procedencia;
  seriesKey?: string;
}

const sinNoDisponible = (valor: string | null): string | null =>
  valor === null || valor === NO_DISPONIBLE ? null : valor;

const unir = (partes: readonly (string | null)[]): string =>
  partes.filter((parte): parte is string => parte !== null && parte !== '').join(', ');

function candidatoDeDiagnostico(diagnostico: NonNullable<ClinicalContext['diagnosis']>): Candidato {
  const estadio = sinNoDisponible(diagnostico.stageValue);
  const sistema = sinNoDisponible(diagnostico.stagingSystem);
  return {
    dataRef: diagnostico.dataRef,
    kind: 'diagnostico',
    provenance: diagnostico.provenance,
    verbalization: unir([
      diagnostico.histology,
      diagnostico.grade,
      estadio === null ? null : `estadio ${estadio}${sistema === null ? '' : ` (${sistema})`}`,
      diagnostico.performanceScale === null || diagnostico.performanceValue === null
        ? null
        : `${diagnostico.performanceScale} ${diagnostico.performanceValue}`,
    ]),
  };
}

/** Los candidatos en el orden del contexto: diagnóstico, biomarcadores, atributos, tratamientos y eventos. */
function candidatosDelContexto(contexto: ClinicalContext): Candidato[] {
  return [
    ...(contexto.diagnosis === null ? [] : [candidatoDeDiagnostico(contexto.diagnosis)]),
    ...contexto.biomarkers.map((biomarcador) => ({
      dataRef: biomarcador.dataRef,
      kind: 'biomarcador',
      provenance: biomarcador.provenance,
      seriesKey: biomarcador.biomarkerName.toLowerCase(),
      verbalization: `${biomarcador.biomarkerName}: ${biomarcador.value}, ${biomarcador.clinicalSignificance}`,
    })),
    ...contexto.attributes.map((atributo) => ({
      dataRef: atributo.dataRef,
      kind: 'atributo',
      provenance: atributo.provenance,
      verbalization: `${atributo.key.replaceAll('_', ' ')}: ${atributo.value}`,
    })),
    ...contexto.priorTreatments.map((tratamiento) => ({
      dataRef: tratamiento.dataRef,
      kind: 'tratamiento',
      provenance: tratamiento.provenance,
      verbalization: unir([
        tratamiento.regimenName,
        tratamiento.lineNumber === null ? null : `línea ${tratamiento.lineNumber}`,
      ]),
    })),
    ...contexto.events.map((evento) => ({
      dataRef: evento.dataRef,
      kind: 'evento',
      provenance: evento.provenance,
      verbalization: `${evento.eventType}: ${evento.description}`,
    })),
  ];
}

type BuscadorDeFecha = (caso: CasoClinico, id: string) => string | null;

/** Cómo se halla la fecha confiable de cada clase de dato (`fechaConfiable()` donde la fila trae precisión). */
const FECHA_POR_TABLA: Readonly<Record<EnlaceDeDato['tabla'], BuscadorDeFecha>> = {
  diagnosis: (caso, id) =>
    caso.diagnosticoActivo?.id === id ? caso.diagnosticoActivo.diagnosedAt : null,
  biomarker: (caso, id) => caso.biomarcadores.find((fila) => fila.id === id)?.performedAt ?? null,
  clinical_attribute: (caso, id) => {
    const fila = caso.atributos.find((candidata) => candidata.id === id);
    return fila === undefined ? null : fechaConfiable(fila.observedAt, fila.datePrecision);
  },
  prior_treatment: (caso, id) =>
    caso.tratamientosPrevios.find((fila) => fila.id === id)?.startedAt ?? null,
  clinical_event: (caso, id) => {
    const fila = caso.eventos.find((candidata) => candidata.id === id);
    return fila === undefined ? null : fechaConfiable(fila.eventDate, fila.datePrecision);
  },
};

/** Fecha `AAAA-MM-DD` confiable del dato que respalda el hecho, o `null` si el dato no tiene fecha confiable. */
const fechaDelDato = (enlace: EnlaceDeDato, caso: CasoClinico): string | null =>
  FECHA_POR_TABLA[enlace.tabla](caso, enlace.id);

const MS_POR_DIA = 86_400_000;

/** Días entre dos fechas `AAAA-MM-DD`; `null` si falta alguna. Es el día relativo al diagnóstico (RN-11). */
function diasEntre(desde: string | null, hasta: string | null): number | null {
  if (desde === null || hasta === null) return null;
  const diferencia = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.round(diferencia / MS_POR_DIA);
}

const TIPO_DE_RECURSO: Readonly<
  Record<EnlaceDeDato['tabla'], ConversationDataLink['resourceType']>
> = {
  diagnosis: 'diagnosis',
  biomarker: 'biomarker',
  clinical_attribute: 'clinical_attribute',
  prior_treatment: 'prior_treatment',
  clinical_event: 'clinical_event',
};

/**
 * Hechos del caso del turno (`f1`, `f2`…) desde el contexto YA desidentificado: la verbalización sale del texto
 * enmascarado y sin fechas absolutas; el día relativo y la fecha registrada salen de las filas del caso y la fecha solo
 * va al enlace del navegador (RN-10, RN-11). El mapa `factRef → recurso` no sale de Backend 1.
 */
export function construirHechosDelCaso(
  contexto: ClinicalContext,
  dataRefs: MapaDeDataRefs,
  caso: CasoClinico,
): HechosDelCaso {
  const caseFacts: CaseFact[] = [];
  const enlaces = new Map<string, EnlaceDelHecho>();
  const fechaDelDiagnostico =
    caso.diagnosticoActivo === null ? null : caso.diagnosticoActivo.diagnosedAt;
  for (const candidato of candidatosDelContexto(contexto)) {
    const dato = dataRefs.get(candidato.dataRef);
    if (dato === undefined) continue;
    const factRef = `f${caseFacts.length + 1}`;
    const fecha = fechaDelDato(dato, caso);
    const relativeDay = diasEntre(fechaDelDiagnostico, fecha);
    caseFacts.push({
      factRef,
      kind: candidato.kind,
      verbalization: candidato.verbalization,
      relativeDay,
      reviewStatus: candidato.provenance.reviewStatus,
      ...(candidato.seriesKey !== undefined && { seriesKey: candidato.seriesKey }),
    });
    enlaces.set(factRef, {
      resourceType: TIPO_DE_RECURSO[dato.tabla],
      resourceId: dato.id,
      origin: candidato.provenance.entryMethod,
      relativeDay,
      recordedDate: fecha,
    });
  }
  return { caseFacts, enlaces };
}
