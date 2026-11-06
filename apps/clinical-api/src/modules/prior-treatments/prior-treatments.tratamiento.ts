import type { PriorTreatment } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { comoProvenance } from '../patients/ficha.reglas.js';
import { estadoPersistible, type DecisionDeNormalizacion } from '../reconciliation/ports.js';
import { motivoDeFinPersistido } from './prior-treatments.reglas.js';
import type { CuerpoDeTratamiento } from './prior-treatments.schema.js';
import type { TratamientoAGuardar } from './ports.js';

export interface EntradaDelTratamiento {
  readonly cuerpo: CuerpoDeTratamiento;
  /** Lo decidió `ReconciliationService` (RN-27): este módulo nunca asigna `atcCodes` ni `mapping_status`. */
  readonly decision: DecisionDeNormalizacion;
  readonly patientId: string;
  readonly episodeId: string;
  readonly ahora: Date;
  readonly generarId: GeneradorDeIds;
}

/** La fila del tratamiento manual: esquema tal como llegó, códigos de la decisión y procedencia manual verificada. */
export function armarTratamientoManual(entrada: EntradaDelTratamiento): TratamientoAGuardar {
  const { cuerpo, decision } = entrada;
  return {
    id: entrada.generarId(),
    patientId: entrada.patientId,
    episodeId: entrada.episodeId,
    lineNumber: cuerpo.lineNumber ?? null,
    setting: cuerpo.setting,
    regimenName: cuerpo.regimenName,
    atcCodes: decision.atcCodes,
    // Un `PriorTreatment` nunca es `n_a` (solo `ClinicalEvent` sin código): `estadoPersistible` lo garantiza.
    mappingStatus: estadoPersistible(decision),
    startedAt: cuerpo.startedAt ?? null,
    endedAt: cuerpo.endedAt ?? null,
    ongoing: cuerpo.ongoing,
    endReason: motivoDeFinPersistido(cuerpo),
    entryMethod: 'manual',
    extractionConfidence: 'n_a',
    reviewStatus: 'verificado',
    createdAt: entrada.ahora,
    supersedesId: null,
  };
}

/** `PriorTreatment` del contrato: la fila guardada, con su procedencia (sin documento fuente ni duplicados). */
export function comoTratamientoDelContrato(t: TratamientoAGuardar): PriorTreatment {
  return {
    id: t.id,
    lineNumber: t.lineNumber,
    setting: t.setting,
    regimenName: t.regimenName,
    atcCodes: [...t.atcCodes],
    mappingStatus: t.mappingStatus,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    ongoing: t.ongoing,
    endReason: t.endReason,
    provenance: comoProvenance(
      {
        entryMethod: t.entryMethod,
        extractionConfidence: t.extractionConfidence,
        reviewStatus: t.reviewStatus,
        conflictsWithId: null,
        sourceDocumentId: null,
      },
      [],
    ),
    // Opcional en el contrato: solo una corrección lo trae, así la UI sabe si hay histórico (ADR-50).
    ...(t.supersedesId !== null && { supersedesId: t.supersedesId }),
  };
}
