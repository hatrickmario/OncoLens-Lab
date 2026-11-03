import 'server-only';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';
import { crearManejadorSeguimiento } from '../../../../../lib/server/follow-ups';

// Route Handler, no Server Action (readme §2.1): el navegador solo habla con web. Sin caché ni streaming.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ analysisId: string }> },
): Promise<Response> {
  const { analysisId } = await contexto.params;
  return crearManejadorSeguimiento(dependenciasDeEntorno())(request, analysisId);
}
