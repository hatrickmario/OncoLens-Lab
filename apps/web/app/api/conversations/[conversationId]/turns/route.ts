import 'server-only';
import { crearManejadorTurnoDeConversacion } from '../../../../../lib/server/conversaciones';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';

// Route Handler, no Server Action (readme §2.1): el navegador solo habla con web. Sin caché ni streaming.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await contexto.params;
  return crearManejadorTurnoDeConversacion(dependenciasDeEntorno())(request, conversationId);
}
