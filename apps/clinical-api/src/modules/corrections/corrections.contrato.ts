import type {
  Biomarker,
  ClinicalNote,
  CorrectionHistory,
  CorrectionHistoryEntry,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { comoBiomarcador, comoProvenance } from '../patients/ficha.reglas.js';
import type {
  NotaCorregidaAGuardar,
  NotaVigente,
  PlanDeCorreccionDeBiomarcador,
  VersionReemplazada,
} from './ports.js';

/** `date` de la base → `date-time` del contrato (la nota y el examen guardan solo el día). */
const comoInstante = (fecha: string): string => `${fecha}T00:00:00.000Z`;

/** `Biomarker` de la corrección recién guardada: procedencia `manual_correction` verificada y enlace `supersedesId`. */
export function comoBiomarcadorCorregido({
  examen,
  biomarcador,
}: PlanDeCorreccionDeBiomarcador): Biomarker {
  return comoBiomarcador(
    {
      id: biomarcador.id,
      name: biomarcador.name,
      loincCode: biomarcador.loincCode,
      mappingStatus: biomarcador.mappingStatus,
      value: biomarcador.value,
      unit: biomarcador.unit,
      referenceRange: biomarcador.referenceRange,
      resultType: biomarcador.resultType,
      clinicalSignificance: biomarcador.clinicalSignificance,
      significanceSource: biomarcador.significanceSource,
      examType: examen.examType,
      performedAt: examen.performedAt,
      createdAt: biomarcador.createdAt,
      entryMethod: examen.entryMethod,
      extractionConfidence: biomarcador.extractionConfidence,
      reviewStatus: biomarcador.reviewStatus,
      conflictsWithId: null,
      sourceDocumentId: null,
      supersedesId: biomarcador.supersedesId,
    },
    [],
  );
}

export function comoNotaDelContrato(nota: NotaVigente): ClinicalNote {
  return {
    id: nota.id,
    noteType: nota.noteType,
    content: nota.content,
    recordedAt: comoInstante(nota.recordedAt),
    provenance: comoProvenance(
      {
        entryMethod: nota.entryMethod,
        extractionConfidence: nota.extractionConfidence,
        reviewStatus: nota.reviewStatus,
        conflictsWithId: null,
        sourceDocumentId: nota.sourceDocumentId,
      },
      [],
    ),
    supersedesId: nota.supersedesId,
  };
}

/** La nota recién corregida tal como la devuelve el contrato (verificada, sin documento fuente). */
export function comoNotaCorregida(nota: NotaCorregidaAGuardar): ClinicalNote {
  return comoNotaDelContrato({
    id: nota.id,
    noteType: nota.noteType,
    content: nota.content,
    recordedAt: nota.recordedAt,
    entryMethod: nota.entryMethod,
    extractionConfidence: nota.extractionConfidence,
    reviewStatus: nota.reviewStatus,
    sourceDocumentId: null,
    supersedesId: nota.supersedesId,
  });
}

function comoEntradaDeHistorial(version: VersionReemplazada): CorrectionHistoryEntry {
  return {
    id: version.id,
    entryMethod: version.entryMethod,
    reviewStatus: 'reemplazado',
    recordedAt: comoInstante(version.recordedAt),
    createdAt: version.createdAt.toISOString(),
    // `value`/`unit` solo en biomarcadores; `content`/`noteType` solo en notas (CorrectionHistoryEntry).
    ...(version.value !== undefined && { value: version.value }),
    ...(version.unit !== undefined && { unit: version.unit }),
    ...(version.content !== undefined && { content: version.content }),
    ...(version.noteType !== undefined && { noteType: version.noteType }),
  };
}

export function comoHistorialDelContrato(
  versiones: readonly VersionReemplazada[],
): CorrectionHistory {
  return { items: versiones.map(comoEntradaDeHistorial) };
}
