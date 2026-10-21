/**
 * Clave del objeto en `clinical-minio`: `<patientId>/<documentId>` (ambos UUID generados por el servidor). No lleva
 * nombre original, extensión ni checksum: un nombre de archivo suele traer nombre o documento del paciente (RN-10).
 */
export function claveDeObjeto(patientId: string, documentId: string): string {
  return `${patientId}/${documentId}`;
}

const FIRMA_DE_PDF = Buffer.from('%PDF-', 'latin1');

/** El archivo es un PDF por sus primeros bytes (`%PDF-`), nunca por la extensión ni por el `Content-Type` declarado. */
export function esPdfPorMagicBytes(contenido: Buffer): boolean {
  return contenido.subarray(0, FIRMA_DE_PDF.length).equals(FIRMA_DE_PDF);
}

const BYTES_POR_MIB = 1024 * 1024;

/** `MAX_UPLOAD_MB` (MiB) en bytes. */
export function bytesMaximosDeCarga(maxUploadMb: number): number {
  return maxUploadMb * BYTES_POR_MIB;
}

/** El archivo pesa más que el máximo configurado; medir justo el máximo es válido. */
export function superaTamanoMaximo(tamanoEnBytes: number, maxUploadMb: number): boolean {
  return tamanoEnBytes > bytesMaximosDeCarga(maxUploadMb);
}
