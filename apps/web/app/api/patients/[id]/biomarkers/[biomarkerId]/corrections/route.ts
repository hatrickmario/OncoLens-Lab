import 'server-only';
import { dependenciasDeEntorno } from '../../../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../../../lib/server/registro-manual';

// Route Handler (POST): corrige un biomarcador vigente conservando el anterior (US-253). Verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string; biomarkerId: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(dependenciasDeEntorno(), 'correctBiomarker');
  return manejador(request, await contexto.params);
}
