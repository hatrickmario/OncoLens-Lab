import {
  filaDeAnalisisConEvidencia,
  filaDeDiagnostico,
  filaDeResumenDeCaso,
  generadorDeIds,
  insertar,
  type Fila,
  type GeneradorDeIds,
} from './filas-sinteticas.js';
import { nuevoPaciente, type ContextoDeSiembra, type PacienteSembrado } from './completitud.js';

/**
 * FX-02b-a · Paciente «P-CASO» (próstata, sintético) de `FEAT-02b` §Fixtures (L1D-74, US-088). Todo es sintético
 * (`data_origin = sintetico`, RN-13, RN-14): los documentos `D1`…`D3` están `completado` sin objeto en MinIO, las filas
 * `entry_method = ocr` se insertan como datos (sin OCR, D-8) y los ATC son reales (`[S5 resp. 10]`: leuprorelina
 * `L02AE02`, bicalutamida `L02BB03`). La PII sintética de la toxicidad se arma en tiempo de test y solo con una opción
 * explícita: el escáner de PII de la CI no distingue un valor sintético de uno real (design D15).
 */

/** Reloj de test del fixture: el `created_at` de las filas sembradas (el `eventDate` del análisis sale de aquí). */
export const RELOJ_DE_PCASO = '2026-10-01T12:00:00.000Z';
/**
 * Espacio de ids con el que se siembra el ejemplo publicado: los ids de las filas de P-CASO son
 * `<espacio en hex>-0000-4000-8000-<orden de inserción>` y por eso `contracts/examples/case-view-p-caso.json` los
 * conserva. Sembrar a P-CASO dos veces en una misma base exige otro espacio.
 */
export const ESPACIO_DE_PCASO = 7410;

const ASCENDIENTE = 'primera_linea_metastasica';
const SIN_FUENTE = null;

export interface OpcionesDeSiembraDePCaso {
  espacio?: number;
  /** Arma en `description` de la toxicidad el nombre y el documento sintéticos (test de no-fuga en logs, RN-10). */
  conPiiEnLaToxicidad?: boolean;
  /** Texto sembrado en la síntesis del análisis (el registro es inmutable: va en la siembra); no debe salir en la vista. */
  textoDelAnalisis?: string;
}

export interface IdsDePCaso {
  readonly documentos: { readonly d1: string; readonly d2: string; readonly d3: string };
  readonly diagnostico: string;
  readonly bicalutamida: string;
  readonly leuprorelina: string;
  readonly examenes: readonly [string, string, string];
  readonly psa: readonly [string, string, string];
  readonly testosterona: string;
  readonly progresion: string;
  readonly toxicidad: string;
  readonly cirugia: string;
  readonly atributoCastracion: string;
  readonly atributoSitios: string;
  readonly analisis: string;
  readonly resumen: string;
}

export interface PCasoSembrado extends PacienteSembrado {
  readonly filas: IdsDePCaso;
}

/** Nombre y documento sintéticos de la toxicidad de P-CASO; armados por partes (el escáner de PII no los ve en el repo). */
export function piiSinteticaDePCaso(): { nombre: string; documento: string; descripcion: string } {
  const nombre = ['Marta', 'Sintetica', 'Pruebas'].join(' ');
  const documento = ['7', '6', '5', '4', '3', '2', '1'].join('');
  return {
    nombre,
    documento,
    descripcion: `Toxicidad cutánea grado 2 en ${nombre} CC ${documento}`,
  };
}

export const DESCRIPCION_DE_LA_TOXICIDAD = 'Toxicidad cutánea grado 2';

type Procedencia = Pick<Fila, 'entry_method' | 'extraction_confidence' | 'review_status'>;

const ocr = (confianza: string, revision: string): Procedencia => ({
  entry_method: 'ocr',
  extraction_confidence: confianza,
  review_status: revision,
});

async function sembrarDocumentos(
  p: PacienteSembrado,
  siguiente: GeneradorDeIds,
): Promise<IdsDePCaso['documentos']> {
  const documento = async (tipo: string, subidoEn: string): Promise<string> => {
    const id = siguiente();
    await insertar(p.cliente, 'clinical.document', {
      id,
      patient_id: p.patientId,
      episode_id: p.episodeId,
      document_type: tipo,
      object_storage_key: `sintetico/${id}.pdf`,
      checksum: `sha256-sintetico-${id}`,
      original_filename: 'sintetico.pdf',
      mime_type: 'application/pdf',
      ocr_status: 'completado',
      attempts: 0,
      uploaded_by: p.userId,
      uploaded_at: subidoEn,
      extracted_at: subidoEn,
    });
    return id;
  };
  return {
    d1: await documento('historia_clinica', '2025-10-05T12:00:00.000Z'),
    d2: await documento('examen', '2026-04-12T12:00:00.000Z'),
    d3: await documento('examen', '2026-07-15T12:00:00.000Z'),
  };
}

async function sembrarTratamiento(p: PacienteSembrado, id: string, resto: Fila): Promise<void> {
  await insertar(p.cliente, 'clinical.prior_treatment', {
    id,
    patient_id: p.patientId,
    episode_id: p.episodeId,
    source_document_id: SIN_FUENTE,
    setting: ASCENDIENTE,
    mapping_status: 'mapeado',
    ended_at: null,
    created_at: RELOJ_DE_PCASO,
    ...resto,
  });
}

interface PuntoDeSerie {
  readonly nombre: string;
  readonly valor: string;
  readonly unidad: string;
  readonly procedencia: Procedencia;
}

async function sembrarExamen(
  p: PacienteSembrado,
  siguiente: GeneradorDeIds,
  examen: { fecha: string; documento: string },
  puntos: readonly PuntoDeSerie[],
): Promise<{ examen: string; biomarcadores: string[] }> {
  const examenId = siguiente();
  await insertar(p.cliente, 'clinical.exam', {
    id: examenId,
    patient_id: p.patientId,
    episode_id: p.episodeId,
    source_document_id: examen.documento,
    exam_type: 'laboratorio',
    source_lab: null,
    entry_method: 'ocr',
    performed_at: examen.fecha,
    created_at: RELOJ_DE_PCASO,
  });
  const biomarcadores: string[] = [];
  for (const punto of puntos) {
    const id = siguiente();
    biomarcadores.push(id);
    await insertar(p.cliente, 'clinical.biomarker', {
      id,
      exam_id: examenId,
      name: punto.nombre,
      original_name: punto.nombre,
      mapping_status: 'no_mapeado',
      value: punto.valor,
      unit: punto.unidad,
      reference_range: '',
      result_type: 'cuantitativo',
      clinical_significance: 'relevante',
      significance_source: 'documento',
      source_span: '{}',
      created_at: RELOJ_DE_PCASO,
      extraction_confidence: punto.procedencia['extraction_confidence'],
      review_status: punto.procedencia['review_status'],
    });
  }
  return { examen: examenId, biomarcadores };
}

async function sembrarEventoClinico(p: PacienteSembrado, id: string, resto: Fila): Promise<void> {
  await insertar(p.cliente, 'clinical.clinical_event', {
    id,
    patient_id: p.patientId,
    episode_id: p.episodeId,
    source_span: '{}',
    created_at: RELOJ_DE_PCASO,
    ...resto,
  });
}

async function sembrarAtributoDeCaso(p: PacienteSembrado, id: string, resto: Fila): Promise<void> {
  await insertar(p.cliente, 'clinical.clinical_attribute', {
    id,
    patient_id: p.patientId,
    episode_id: p.episodeId,
    date_precision: 'dia',
    created_at: RELOJ_DE_PCASO,
    ...resto,
  });
}

/**
 * Siembra a P-CASO: documentos `D1` (2025-10-05), `D2` (2026-04-12) y `D3` (2026-07-15), el diagnóstico activo, los dos
 * tratamientos previos, los tres exámenes (PSA y testosterona, cuatro biomarcadores), los tres eventos clínicos (uno `rechazado`), los
 * dos atributos y los dos `AIAnalysisRecord`. El orden de inserción fija los ids (ver `ESPACIO_DE_PCASO`).
 */
export async function sembrarPCaso(
  contexto: ContextoDeSiembra,
  opciones: OpcionesDeSiembraDePCaso = {},
): Promise<PCasoSembrado> {
  const p = await nuevoPaciente(contexto);
  const siguiente = generadorDeIds(opciones.espacio ?? ESPACIO_DE_PCASO);
  const { d1, d2, d3 } = await sembrarDocumentos(p, siguiente);

  const diagnostico = await insertar(
    p.cliente,
    'clinical.diagnosis',
    filaDeDiagnostico(siguiente, p.patientId, p.episodeId, {
      source_document_id: d1,
      icd10_code: 'C61',
      histology: 'adenocarcinoma acinar',
      grade: 'ISUP 3',
      staging_system: 'TNM_8',
      stage_value: 'T3aN0M1b',
      performance_scale: 'ECOG',
      performance_value: 1,
      diagnosed_at: '2025-10-05',
      created_at: RELOJ_DE_PCASO,
      ...ocr('alta', 'verificado'),
    }),
  );

  const bicalutamida = siguiente();
  await sembrarTratamiento(p, bicalutamida, {
    line_number: null,
    regimen_name: 'Bicalutamida',
    atc_codes: ['L02BB03'],
    started_at: '2025-10-20',
    ended_at: '2025-11-15',
    ongoing: false,
    end_reason: 'completado',
    entry_method: 'manual',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
  });
  const leuprorelina = siguiente();
  await sembrarTratamiento(p, leuprorelina, {
    source_document_id: d1,
    line_number: 1,
    regimen_name: 'Leuprorelina',
    atc_codes: ['L02AE02'],
    started_at: '2025-11-01',
    ongoing: true,
    end_reason: 'desconocido',
    ...ocr('alta', 'verificado'),
  });

  const psa = (valor: string, procedencia: Procedencia): PuntoDeSerie => ({
    nombre: 'PSA',
    valor,
    unidad: 'ng/mL',
    procedencia,
  });
  const examen1 = await sembrarExamen(p, siguiente, { fecha: '2026-01-10', documento: d1 }, [
    psa('4.1', ocr('alta', 'verificado')),
  ]);
  const examen2 = await sembrarExamen(p, siguiente, { fecha: '2026-04-12', documento: d2 }, [
    psa('6.8', ocr('media', 'auto_aceptado')),
  ]);
  const examen3 = await sembrarExamen(p, siguiente, { fecha: '2026-07-15', documento: d3 }, [
    psa('9.5', ocr('media', 'requiere_revision')),
    {
      nombre: 'Testosterona',
      valor: '25',
      unidad: 'ng/dL',
      procedencia: ocr('alta', 'verificado'),
    },
  ]);
  // Segunda fuente del PSA del 2026-04-12 (D3): la vista de caso mínima no la expone (D-8).
  await insertar(p.cliente, 'clinical.clinical_data_source', {
    id: siguiente(),
    data_type: 'biomarker',
    data_id: examen2.biomarcadores[0],
    document_id: d3,
    source_span: '{}',
    created_at: RELOJ_DE_PCASO,
  });

  const progresion = siguiente();
  await sembrarEventoClinico(p, progresion, {
    source_document_id: d3,
    event_type: 'progresion',
    event_date: '2026-07-20',
    date_precision: 'dia',
    description: 'Progresión bioquímica por PSA',
    mapping_status: 'n_a',
    ...ocr('alta', 'verificado'),
  });
  const toxicidad = siguiente();
  await sembrarEventoClinico(p, toxicidad, {
    source_document_id: d2,
    event_type: 'toxicidad',
    event_date: null,
    date_precision: 'incierta',
    description:
      opciones.conPiiEnLaToxicidad === true
        ? piiSinteticaDePCaso().descripcion
        : DESCRIPCION_DE_LA_TOXICIDAD,
    toxicity_grade: '2',
    mapping_status: 'n_a',
    ...ocr('media', 'requiere_revision'),
  });
  const cirugia = siguiente();
  await sembrarEventoClinico(p, cirugia, {
    source_document_id: d1,
    event_type: 'cirugia',
    event_date: '2025-12-01',
    date_precision: 'dia',
    description: 'Cirugía rechazada',
    mapping_status: 'no_mapeado',
    ...ocr('alta', 'rechazado'),
  });

  const atributoCastracion = siguiente();
  await sembrarAtributoDeCaso(p, atributoCastracion, {
    source_document_id: d3,
    attribute_key: 'estado_castracion',
    value: 'castrado',
    observed_at: '2026-07-15',
    ...ocr('media', 'auto_aceptado'),
  });
  const atributoSitios = siguiente();
  await sembrarAtributoDeCaso(p, atributoSitios, {
    source_document_id: d1,
    attribute_key: 'sitios_metastasicos',
    value: 'oseo',
    observed_at: '2025-10-05',
    ...ocr('alta', 'verificado'),
  });

  const analisis = await insertar(
    p.cliente,
    'clinical.ai_analysis_record',
    filaDeAnalisisConEvidencia(siguiente, p.patientId, p.episodeId, p.userId, {
      created_at: '2026-08-01T12:00:00.000Z',
      ...(opciones.textoDelAnalisis !== undefined && {
        synthesis: JSON.stringify({ texto: opciones.textoDelAnalisis }),
      }),
    }),
  );
  const resumen = await insertar(
    p.cliente,
    'clinical.ai_analysis_record',
    filaDeResumenDeCaso(siguiente, p.patientId, p.episodeId, p.userId, {
      created_at: '2026-08-02T12:00:00.000Z',
    }),
  );

  return {
    ...p,
    filas: {
      documentos: { d1, d2, d3 },
      diagnostico: diagnostico['id'] as string,
      bicalutamida,
      leuprorelina,
      examenes: [examen1.examen, examen2.examen, examen3.examen],
      psa: [
        examen1.biomarcadores[0] ?? '',
        examen2.biomarcadores[0] ?? '',
        examen3.biomarcadores[0] ?? '',
      ],
      testosterona: examen3.biomarcadores[1] ?? '',
      progresion,
      toxicidad,
      cirugia,
      atributoCastracion,
      atributoSitios,
      analisis: analisis['id'] as string,
      resumen: resumen['id'] as string,
    },
  };
}

/**
 * Un `ClinicalEvent` con `analysis_id`: el reflejo de un análisis previo, que no es un dato clínico propio. No debe
 * aparecer en el timeline ni sumar en `pendingReviewCount` (US-088 AC-5, ADR-32).
 */
export async function sembrarEventoReflejoDeAnalisis(
  p: PCasoSembrado,
  id: string,
  reviewStatus: string,
): Promise<void> {
  await sembrarEventoClinico(p, id, {
    event_type: 'evolucion',
    event_date: '2026-08-01',
    date_precision: 'dia',
    description: 'Reflejo del analisis previo',
    mapping_status: 'n_a',
    analysis_id: p.filas.analisis,
    entry_method: 'manual',
    extraction_confidence: 'n_a',
    review_status: reviewStatus,
  });
}
