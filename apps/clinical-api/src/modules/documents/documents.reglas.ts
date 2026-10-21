/**
 * Clave del objeto en `clinical-minio`: `<patientId>/<documentId>` (ambos UUID generados por el servidor). No lleva
 * nombre original, extensión ni checksum: un nombre de archivo suele traer nombre o documento del paciente (RN-10).
 */
export function claveDeObjeto(patientId: string, documentId: string): string {
  return `${patientId}/${documentId}`;
}
