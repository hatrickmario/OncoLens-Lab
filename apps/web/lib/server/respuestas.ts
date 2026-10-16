import 'server-only';

/** Respuesta JSON propia del BFF (403, 413, 502): nunca cacheable, igual que las que reenvía de clinical-api. */
export function respuestaPropia(cuerpo: unknown, status: number): Response {
  return Response.json(cuerpo, { status, headers: { 'Cache-Control': 'no-store' } });
}
