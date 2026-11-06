import type { Consultador } from '../auth/auth.repository.js';
import { episodioDelRegistro, tipoDeCancerVigente } from '../compartido/contexto-de-registro.js';
import { reemplazarDeclaracionesDeAusencia } from '../compartido/declaracion-de-ausencia.js';
import { bloquearPaciente } from '../compartido/paciente-activo.js';
import { ejecutarEnTransaccion, type FuenteDeConexiones } from '../compartido/transaccion.js';
import type {
  RepositorioDeTratamientos,
  TransaccionDeTratamiento,
  TratamientoAGuardar,
} from './ports.js';

async function guardarTratamiento(db: Consultador, t: TratamientoAGuardar): Promise<void> {
  await db.query(
    `INSERT INTO clinical.prior_treatment (id, patient_id, episode_id, source_document_id, line_number, setting,
                                           regimen_name, atc_codes, cups_code, mapping_status, started_at, ended_at,
                                           ongoing, end_reason, best_response, entry_method, extraction_confidence,
                                           review_status, source_span, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, NULL, $8, $9, $10, $11, $12, NULL, $13, $14, $15, NULL, $16)`,
    [
      ...[t.id, t.patientId, t.episodeId, t.lineNumber, t.setting, t.regimenName],
      ...[[...t.atcCodes], t.mappingStatus, t.startedAt, t.endedAt, t.ongoing, t.endReason],
      ...[t.entryMethod, t.extractionConfidence, t.reviewStatus, t.createdAt],
    ],
  );
}

function transaccionSobre(db: Consultador): TransaccionDeTratamiento {
  return {
    bloquearPaciente: (patientId) => bloquearPaciente(db, patientId),
    episodioDelRegistro: (patientId) => episodioDelRegistro(db, patientId),
    tipoDeCancerVigente: (patientId) => tipoDeCancerVigente(db, patientId),
    reemplazarDeclaracionesDeAusencia: (patientId) =>
      reemplazarDeclaracionesDeAusencia(db, patientId),
    guardarTratamiento: (tratamiento) => guardarTratamiento(db, tratamiento),
  };
}

/** Repository del tratamiento previo: cada `enTransaccion` toma UNA conexión, abre `BEGIN` y confirma o revierte todo. */
export function createPriorTreatmentsRepository(
  fuente: FuenteDeConexiones,
): RepositorioDeTratamientos {
  return {
    enTransaccion: (trabajo) =>
      ejecutarEnTransaccion(fuente, (conexion) => trabajo(transaccionSobre(conexion))),
  };
}
