import type { ConversationDataLink } from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  CaseFact,
  ClinicalContext,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { estaAusente, unirLoPresente } from '../analysis-basis.verbalizacion.js';
import { NO_DISPONIBLE } from '../clinical-context.builder.js';
import type { EnlaceDeDato, MapaDeDataRefs } from '../ports.js';
import {
  conMarcaDeCorreccion,
  contrapartesDeConflicto,
  type DatoParaConflicto,
} from './conflictos.js';

/** Qué dato del paciente respalda un `factRef`: solo vive en Backend 1 durante el turno (nunca viaja a Backend 2). */
export type EnlaceDelHecho = Omit<ConversationDataLink, 'factRef'>;

export interface HechosDelCaso {
  caseFacts: HechoDelCaso[];
  enlaces: ReadonlyMap<string, EnlaceDelHecho>;
}

type Procedencia = ClinicalContext['biomarkers'][number]['provenance'];

/** Clases de hecho que el chat verbaliza; `ETIQUETA_POR_CLASE` (reglas) tiene una etiqueta para cada una. */
export type ClaseDeHecho = 'diagnostico' | 'biomarcador' | 'atributo' | 'tratamiento' | 'evento';

/** Un `CaseFact` con su clase tipada: así `dataUsed` no necesita un valor por defecto. */
export type HechoDelCaso = CaseFact & { kind: ClaseDeHecho };

/** Un hecho antes de numerarlo: su clase, su texto y el dato del paciente que lo respalda. */
interface Candidato {
  dataRef: string;
  kind: ClaseDeHecho;
  verbalization: string;
  provenance: Procedencia;
  seriesKey?: string;
}

function candidatoDeDiagnostico(diagnostico: NonNullable<ClinicalContext['diagnosis']>): Candidato {
  return {
    dataRef: diagnostico.dataRef,
    kind: 'diagnostico',
    provenance: diagnostico.provenance,
    verbalization: unirLoPresente(
      [
        diagnostico.histology ?? '',
        diagnostico.grade ?? '',
        estaAusente(diagnostico.stageValue)
          ? `estadio: ${NO_DISPONIBLE}` // RN-25: el dato ausente se dice, no se calla
          : `estadio ${diagnostico.stageValue} (${diagnostico.stagingSystem})`,
        diagnostico.performanceScale === null || diagnostico.performanceValue === null
          ? ''
          : `${diagnostico.performanceScale} ${diagnostico.performanceValue}`,
      ],
      ', ',
    ),
  };
}

/** `Nombre: valor, significado`; un valor ausente se escribe «No disponible» sin el significado (RN-25). */
function verbalizarBiomarcador(biomarcador: ClinicalContext['biomarkers'][number]): string {
  return estaAusente(biomarcador.value)
    ? `${biomarcador.biomarkerName}: ${NO_DISPONIBLE}`
    : `${biomarcador.biomarkerName}: ${biomarcador.value}, ${biomarcador.clinicalSignificance}`;
}

/** Clave de la serie de un biomarcador: su nombre en minúsculas y sin separadores (`CA 15-3` → `ca153`). */
function claveDeSerie(nombre: string): string {
  return nombre.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

/** Una corrección vigente (ADR-50) se marca para que la UI y el LLM la distingan de un dato extraído. */
function esCorreccion(procedencia: Procedencia): boolean {
  return (
    procedencia.entryMethod === 'manual_correction' || procedencia.reviewStatus === 'corregido'
  );
}

/** Los candidatos en el orden del contexto: diagnóstico, biomarcadores, atributos, tratamientos y eventos. */
function candidatosDelContexto(contexto: ClinicalContext): Candidato[] {
  return [
    ...(contexto.diagnosis === null ? [] : [candidatoDeDiagnostico(contexto.diagnosis)]),
    ...contexto.biomarkers.map((biomarcador) => ({
      dataRef: biomarcador.dataRef,
      kind: 'biomarcador' as const,
      provenance: biomarcador.provenance,
      seriesKey: claveDeSerie(biomarcador.biomarkerName),
      verbalization: verbalizarBiomarcador(biomarcador),
    })),
    ...contexto.attributes.map((atributo) => ({
      dataRef: atributo.dataRef,
      kind: 'atributo' as const,
      provenance: atributo.provenance,
      verbalization: `${atributo.key.replaceAll('_', ' ')}: ${atributo.value}`,
    })),
    ...contexto.priorTreatments.map((tratamiento) => ({
      dataRef: tratamiento.dataRef,
      kind: 'tratamiento' as const,
      provenance: tratamiento.provenance,
      verbalization: unirLoPresente(
        [
          tratamiento.regimenName,
          tratamiento.lineNumber === null ? '' : `línea ${tratamiento.lineNumber}`,
        ],
        ', ',
      ),
    })),
    ...contexto.events.map((evento) => ({
      dataRef: evento.dataRef,
      kind: 'evento' as const,
      provenance: evento.provenance,
      verbalization: `${evento.eventType}: ${evento.description}`,
    })),
  ];
}

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
  contrapartes: readonly ContraparteDeConflicto[] = [],
): HechosDelCaso {
  const caseFacts: HechoDelCaso[] = [];
  const enlaces = new Map<string, EnlaceDelHecho>();
  const datosParaConflicto: DatoParaConflicto[] = [];
  const fechaDelDiagnostico =
    contexto.diagnosis === null ? null : (dataRefs.get(contexto.diagnosis.dataRef)?.fecha ?? null);
  // Las contrapartes de un conflicto van al final: no renumeran los `factRef` del resto del caso.
  const entradas = [
    ...candidatosDelContexto(contexto).map((candidato) => ({
      candidato,
      dato: dataRefs.get(candidato.dataRef),
    })),
    ...contrapartes.map(({ diagnostico, enlace }) => ({
      candidato: candidatoDeDiagnostico(diagnostico),
      dato: enlace,
    })),
  ];
  for (const { candidato, dato } of entradas) {
    if (dato === undefined) continue;
    const factRef = `f${caseFacts.length + 1}`;
    const relativeDay = diasEntre(fechaDelDiagnostico, dato.fecha);
    const corregido = esCorreccion(candidato.provenance);
    caseFacts.push({
      factRef,
      kind: candidato.kind,
      verbalization: corregido
        ? conMarcaDeCorreccion(candidato.verbalization)
        : candidato.verbalization,
      relativeDay,
      reviewStatus: candidato.provenance.reviewStatus,
      ...(candidato.seriesKey !== undefined && { seriesKey: candidato.seriesKey }),
      ...(corregido && { corrected: true }),
    });
    datosParaConflicto.push({
      factRef,
      id: dato.id,
      conflictsWithId: dato.conflictsWithId ?? null,
    });
    enlaces.set(factRef, {
      resourceType: TIPO_DE_RECURSO[dato.tabla],
      resourceId: dato.id,
      origin: candidato.provenance.entryMethod,
      relativeDay,
      recordedDate: dato.fecha,
    });
  }
  return { caseFacts: conContrapartes(caseFacts, datosParaConflicto), enlaces };
}

/** Un diagnóstico en conflicto con el activo, ya desidentificado, con el enlace a su registro (solo vive en Backend 1). */
export interface ContraparteDeConflicto {
  diagnostico: NonNullable<ClinicalContext['diagnosis']>;
  enlace: EnlaceDeDato;
}

/** Añade `conflictWith` (el `factRef` de la contraparte) a los dos hechos de cada par en conflicto (RN-08). */
function conContrapartes(
  caseFacts: HechoDelCaso[],
  datos: readonly DatoParaConflicto[],
): HechoDelCaso[] {
  const pares = contrapartesDeConflicto(datos);
  return caseFacts.map((hecho) => {
    const contraparte = pares.get(hecho.factRef);
    return contraparte === undefined ? hecho : { ...hecho, conflictWith: contraparte };
  });
}
