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
  /** Inserta el documento encolado (`pendiente`, 0 intentos). */
  insertar(documento: NuevoDocumento): Promise<void>;
}

export function createDocumentsRepository(db: Consultador): DocumentsRepository {
  return {
    async insertar(documento) {
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
    },
  };
}
