import 'server-only';
import { dependenciasDeEntorno } from '../../../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../../../lib/server/registro-manual';

// Route Handler (POST): corrige una nota vigente conservando la anterior (US-253). Verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string; noteId: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(dependenciasDeEntorno(), 'correctClinicalNote');
  return manejador(request, await contexto.params);
}
