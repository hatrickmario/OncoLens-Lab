// Esqueleto (US-034 AC-1): el handler real llega con el commit feat(L1D-164).
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response(null, { status: 501 });
}
