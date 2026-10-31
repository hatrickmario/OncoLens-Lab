import 'server-only';
import { crearManejadorChecklist } from '../../../../../lib/server/completeness';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';

// Route Handler (GET): el navegador solo habla con web. Sin caché: el checklist es dato clínico del paciente.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await contexto.params;
  return crearManejadorChecklist(dependenciasDeEntorno())(request, id);
}
