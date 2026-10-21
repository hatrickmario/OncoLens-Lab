import type { Consultador } from '../auth/auth.repository.js';
import type { TipoDeDocumento } from './documents.schema.js';

export interface NuevoDocumento {
  id: string;
  patientId: string;
  documentType: TipoDeDocumento;
  objectStorageKey: string;
  checksum: string;
  originalFilename: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: Date;
}

/** Acceso a `clinical.document` (la cola de extracción: `ocr_status = pendiente`, `attempts = 0`). */
export interface DocumentsRepository {
  existePaciente(patientId: string): Promise<boolean>;
  /** El paciente ya tiene un documento con ese checksum (deduplicación, AC-03.4). */
  existeChecksum(patientId: string, checksum: string): Promise<boolean>;
  /**
   * Inserta el documento encolado (`pendiente`, 0 intentos). `duplicado` si la `UNIQUE(patient_id, checksum)` lo
   * rechaza: otra carga idéntica ganó la carrera entre la comprobación previa y este `INSERT`.
   */
  insertar(documento: NuevoDocumento): Promise<'creado' | 'duplicado'>;
}

const VIOLACION_DE_UNICIDAD = '23505';
const UNICIDAD_PACIENTE_Y_CHECKSUM = 'document_patient_id_checksum_key';

/** Solo la `UNIQUE(patient_id, checksum)` es un duplicado; cualquier otra violación (p. ej. la clave primaria) es un fallo. */
function esDuplicadoPorChecksum(error: unknown): boolean {
  const { code, constraint } = (error ?? {}) as { code?: unknown; constraint?: unknown };
  return code === VIOLACION_DE_UNICIDAD && constraint === UNICIDAD_PACIENTE_Y_CHECKSUM;
}

export function createDocumentsRepository(db: Consultador): DocumentsRepository {
  return {
    async existePaciente(patientId) {
      const { rows } = await db.query('SELECT 1 FROM clinical.patient WHERE id = $1', [patientId]);
      return rows.length > 0;
    },
    async existeChecksum(patientId, checksum) {
      const { rows } = await db.query(
        'SELECT 1 FROM clinical.document WHERE patient_id = $1 AND checksum = $2',
        [patientId, checksum],
      );
      return rows.length > 0;
    },
    async insertar(documento) {
      try {
        await db.query(
          `INSERT INTO clinical.document
           (id, patient_id, document_type, object_storage_key, checksum, original_filename, mime_type,
            ocr_status, attempts, uploaded_by, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente', 0, $8, $9)`,
          [
            documento.id,
            documento.patientId,
            documento.documentType,
            documento.objectStorageKey,
            documento.checksum,
            documento.originalFilename,
            documento.mimeType,
            documento.uploadedBy,
            documento.uploadedAt,
          ],
        );
        return 'creado';
      } catch (error) {
        if (esDuplicadoPorChecksum(error)) return 'duplicado';
        throw error;
      }
    },
  };
}
