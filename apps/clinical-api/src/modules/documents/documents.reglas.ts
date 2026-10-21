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

/** Cabeceras, campos y boundaries del multipart que acompañan al archivo: no cuentan para el máximo del PDF. */
export const MARGEN_DEL_MULTIPART_BYTES = 64 * 1024;

/**
 * `Content-Length` declara un cuerpo que no puede contener un PDF dentro del máximo: se rechaza antes de leerlo. Sin
 * `Content-Length` (transferencia por trozos) no se decide aquí; el lector corta el archivo en el máximo.
 */
export function contenidoExcedeElLimiteDeCarga(
  contentLength: number | undefined,
  maxUploadMb: number,
): boolean {
  return (
    contentLength !== undefined &&
    contentLength > bytesMaximosDeCarga(maxUploadMb) + MARGEN_DEL_MULTIPART_BYTES
  );
}

/**
 * Límite que se le da al lector multipart (busboy). El lector marca el archivo como excedido al ALCANZAR el límite, no
 * al superarlo: con el máximo exacto rechazaría un PDF válido que mide justo `MAX_UPLOAD_MB`. Un byte más separa
 * "mide el máximo" (válido) de "lo excede".
 */
export function limiteDeLecturaDeCarga(maxUploadMb: number): number {
  return bytesMaximosDeCarga(maxUploadMb) + 1;
}

/** Esqueleto: aún no normaliza. */
export function normalizarNombreOriginal(nombre: string): string {
  return nombre;
}
