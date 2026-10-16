// Healthcheck de Compose (US-034 AC-1): no llama a clinical-api ni lee la sesión.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' });
}
