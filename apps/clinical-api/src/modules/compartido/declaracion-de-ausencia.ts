import type { Consultador } from '../auth/auth.repository.js';
import { sqlDatoVigente } from './estados-de-revision.js';
import { DeclaracionIncoherenteError } from './errores-de-registro.js';

/*
 * Glosario: «declaración de ausencia» es el `ClinicalAttribute` `sin_tratamiento_previo = si` con el que el oncólogo
 * deja constancia de que el paciente no ha recibido tratamiento a la fecha (d5fb-04, design D1). No es un tratamiento:
 * no existe una fila `PriorTreatment` que la represente.
 *
 * INVARIANTE ÚNICO (design D4): una declaración vigente y un `PriorTreatment` vigente nunca coexisten. Esta regla vive
 * aquí, en un solo lugar, para que `prior-treatments` y `clinical-attributes` (que no dependen entre sí) la apliquen
 * igual, siempre dentro de una transacción con la fila del paciente bloqueada.
 *
 * Toda vía que deje vigente un `PriorTreatment` (p. ej. la aprobación de una extracción OCR, Post-MVP) debe llamar a
 * esta regla.
 */

/** Clave de la declaración en `atributos.json`; el `satisfiedBy` del catálogo la referencia (RN-29). */
export const CLAVE_DE_AUSENCIA_DE_TRATAMIENTO = 'sin_tratamiento_previo';

export function esDeclaracionDeAusencia(attributeKey: string): boolean {
  return attributeKey === CLAVE_DE_AUSENCIA_DE_TRATAMIENTO;
}

/** Lo que la regla necesita leer de una transacción de atributos: si hay algún `PriorTreatment` vigente (RN-07). */
export interface LecturaDeTratamientosVigentes {
  hayTratamientosVigentes(patientId: string): Promise<boolean>;
}

/** Declarar la ausencia con tratamientos vigentes se rechaza (422, `field = attributeKey`) y no escribe nada. */
export async function exigirSinTratamientosParaDeclarar(
  tx: LecturaDeTratamientosVigentes,
  patientId: string,
): Promise<void> {
  if (await tx.hayTratamientosVigentes(patientId))
    throw new DeclaracionIncoherenteError('attributeKey');
}

/** SQL: ¿tiene el paciente algún `PriorTreatment` que no esté rechazado ni reemplazado? */
export async function hayTratamientosVigentes(
  db: Consultador,
  patientId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM clinical.prior_treatment WHERE patient_id = $1 AND ${sqlDatoVigente('review_status')} LIMIT 1`,
    [patientId],
  );
  return rows.length > 0;
}

/**
 * SQL: al registrar un tratamiento, las declaraciones vigentes pasan a `reemplazado` (RN-05/RN-07: la fila se conserva).
 * Es un acto explícito y verificado del oncólogo, no un dato extraído que sustituya a uno verificado en silencio (RN-08).
 */
export async function reemplazarDeclaracionesDeAusencia(
  db: Consultador,
  patientId: string,
): Promise<void> {
  await db.query(
    `UPDATE clinical.clinical_attribute SET review_status = 'reemplazado'
      WHERE patient_id = $1 AND attribute_key = $2 AND ${sqlDatoVigente('review_status')}`,
    [patientId, CLAVE_DE_AUSENCIA_DE_TRATAMIENTO],
  );
}
