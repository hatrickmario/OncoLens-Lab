import type { Consultador } from '../auth/auth.repository.js';
import { episodioDelRegistro, tipoDeCancerVigente } from '../compartido/contexto-de-registro.js';
import { sqlDatoVigente } from '../compartido/estados-de-revision.js';
import { bloquearPaciente } from '../compartido/paciente-activo.js';
import { ejecutarEnTransaccion, type FuenteDeConexiones } from '../compartido/transaccion.js';
import type {
  AtributoAGuardar,
  AtributoLeido,
  RepositorioDeAtributos,
  TransaccionDeAtributo,
} from './ports.js';

async function existePaciente(db: Consultador, patientId: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM clinical.patient WHERE id = $1', [patientId]);
  return rows.length > 0;
}

async function guardarAtributo(db: Consultador, a: AtributoAGuardar): Promise<void> {
  await db.query(
    `INSERT INTO clinical.clinical_attribute (id, patient_id, episode_id, source_document_id, attribute_key, value,
                                              observed_at, date_precision, entry_method, extraction_confidence,
                                              review_status, source_span, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, NULL, $11)`,
    [
      ...[a.id, a.patientId, a.episodeId, a.attributeKey, a.value, a.observedAt],
      ...[a.datePrecision, a.entryMethod, a.extractionConfidence, a.reviewStatus, a.createdAt],
    ],
  );
}

function atributoLeido(f: Record<string, unknown>): AtributoLeido {
  return {
    id: f['id'] as string,
    attributeKey: f['attribute_key'] as string,
    value: f['value'] as string,
    observedAt: f['observed_at'] as string | null,
    datePrecision: f['date_precision'] as AtributoLeido['datePrecision'],
    entryMethod: f['entry_method'] as AtributoLeido['entryMethod'],
    extractionConfidence: f['extraction_confidence'] as AtributoLeido['extractionConfidence'],
    reviewStatus: f['review_status'] as AtributoLeido['reviewStatus'],
    sourceDocumentId: f['source_document_id'] as string | null,
  };
}

async function atributosVigentes(db: Consultador, patientId: string): Promise<AtributoLeido[]> {
  const { rows } = await db.query(
    `SELECT id, attribute_key, value, to_char(observed_at, 'YYYY-MM-DD') AS observed_at,
            date_precision::text AS date_precision, entry_method::text AS entry_method,
            extraction_confidence::text AS extraction_confidence, review_status::text AS review_status,
            source_document_id
       FROM clinical.clinical_attribute
      WHERE patient_id = $1 AND ${sqlDatoVigente('review_status')}
      ORDER BY attribute_key, observed_at NULLS LAST, id`,
    [patientId],
  );
  return rows.map(atributoLeido);
}

function transaccionSobre(db: Consultador): TransaccionDeAtributo {
  return {
    bloquearPaciente: (patientId) => bloquearPaciente(db, patientId),
    existePaciente: (patientId) => existePaciente(db, patientId),
    episodioDelRegistro: (patientId) => episodioDelRegistro(db, patientId),
    tipoDeCancerVigente: (patientId) => tipoDeCancerVigente(db, patientId),
    guardarAtributo: (atributo) => guardarAtributo(db, atributo),
    atributosVigentes: (patientId) => atributosVigentes(db, patientId),
  };
}

/** Repository del atributo clínico: cada `enTransaccion` toma UNA conexión, abre `BEGIN` y confirma o revierte todo. */
export function createClinicalAttributesRepository(
  fuente: FuenteDeConexiones,
): RepositorioDeAtributos {
  return {
    enTransaccion: (trabajo) =>
      ejecutarEnTransaccion(fuente, (conexion) => trabajo(transaccionSobre(conexion))),
  };
}
