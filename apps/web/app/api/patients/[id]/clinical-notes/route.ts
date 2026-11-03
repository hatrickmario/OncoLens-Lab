import 'server-only';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../lib/server/registro-manual';

// Route Handler (GET): notas clínicas vigentes. Sin caché: es dato clínico (RN-10).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(dependenciasDeEntorno(), 'listClinicalNotes');
  return manejador(request, await contexto.params);
}
