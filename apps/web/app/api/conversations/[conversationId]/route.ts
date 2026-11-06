import 'server-only';
import { crearManejadorLecturaDeConversacion } from '../../../../lib/server/conversaciones';
import { dependenciasDeEntorno } from '../../../../lib/server/dependencias';

// Route Handler (GET): el navegador solo habla con web. Sin caché: la conversación es dato clínico del paciente.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  contexto: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await contexto.params;
  return crearManejadorLecturaDeConversacion(dependenciasDeEntorno())(request, conversationId);
}
