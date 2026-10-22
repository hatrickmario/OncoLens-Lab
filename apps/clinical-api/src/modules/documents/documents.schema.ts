import type { z } from 'zod';
import {
  zUploadDocumentBody,
  zUploadDocumentPath,
} from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Validaciones del borde de `POST /platform/patients/{patientId}/documents`: se generan del spec (los valores de
 * `documentType` y el UUID de la ruta). Lo que el spec no expresa (PDF por magic bytes, tamaño, duplicado) vive en las
 * reglas del dominio.
 */
export const tipoDeDocumentoSchema = zUploadDocumentBody.shape.documentType;
export const idDePacienteSchema = zUploadDocumentPath.shape.patientId;

export type TipoDeDocumento = z.output<typeof tipoDeDocumentoSchema>;
