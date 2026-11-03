import type { Biomarker } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { comoBiomarcador } from '../patients/ficha.reglas.js';
import type { DecisionDeNormalizacion } from '../reconciliation/ports.js';
import type { CuerpoDeBiomarcador } from './manual-entry.schema.js';
import type { BiomarcadorAGuardar, ExamenAGuardar } from './ports.js';

export interface RegistroDeBiomarcador {
  readonly examen: ExamenAGuardar;
  readonly biomarcador: BiomarcadorAGuardar;
}

export interface EntradaDelRegistroDeBiomarcador {
  readonly cuerpo: CuerpoDeBiomarcador;
  /** Lo decidió `ReconciliationService` (RN-27): este módulo nunca asigna `mapping_status`. */
  readonly decision: DecisionDeNormalizacion;
  readonly patientId: string;
  readonly episodeId: string;
  readonly userId: string;
  readonly ahora: Date;
  readonly generarId: GeneradorDeIds;
}

/** El `Exam` manual y su `Biomarker` verificado (D3): término y código de la decisión, texto enviado como nombre original. */
export function armarRegistroDeBiomarcador(
  entrada: EntradaDelRegistroDeBiomarcador,
): RegistroDeBiomarcador {
  const { cuerpo, decision, ahora } = entrada;
  const examen = {
    id: entrada.generarId(),
    patientId: entrada.patientId,
    episodeId: entrada.episodeId,
    performedAt: cuerpo.performedAt,
    createdAt: ahora,
  };
  return {
    examen,
    biomarcador: {
      id: entrada.generarId(),
      examId: examen.id,
      name: decision.name,
      originalName: decision.originalName,
      loincCode: decision.loincCode,
      // Un `Biomarker` nunca es `n_a` (solo `ClinicalEvent` sin código): `estandarDe` lo garantiza.
      mappingStatus: decision.mappingStatus === 'mapeado' ? 'mapeado' : 'no_mapeado',
      value: cuerpo.value,
      unit: cuerpo.unit ?? null,
      resultType: cuerpo.resultType,
      reviewedBy: entrada.userId,
      reviewedAt: ahora,
      createdAt: ahora,
    },
  };
}

/** `Biomarker` del contrato: significancia `relevante` por `regla` (`[S5 resp. 13]`), procedencia manual verificada. */
export function comoBiomarcadorDelContrato({
  examen,
  biomarcador,
}: RegistroDeBiomarcador): Biomarker {
  return comoBiomarcador(
    {
      id: biomarcador.id,
      name: biomarcador.name,
      loincCode: biomarcador.loincCode,
      mappingStatus: biomarcador.mappingStatus,
      value: biomarcador.value,
      unit: biomarcador.unit,
      referenceRange: '',
      resultType: biomarcador.resultType,
      clinicalSignificance: 'relevante',
      significanceSource: 'regla',
      examType: 'registro_manual',
      performedAt: examen.performedAt,
      createdAt: biomarcador.createdAt,
      entryMethod: 'manual',
      extractionConfidence: 'n_a',
      reviewStatus: 'verificado',
      conflictsWithId: null,
      sourceDocumentId: null,
    },
    [],
  );
}
