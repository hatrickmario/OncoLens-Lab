import 'server-only';
import { crearManejadorAperturaDeConversacion } from '../../../../../lib/server/conversaciones';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';

// Route Handler, no Server Action (readme §2.1): el navegador solo habla con web. Sin caché ni streaming.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await contexto.params;
  return crearManejadorAperturaDeConversacion(dependenciasDeEntorno())(request, id);
}
