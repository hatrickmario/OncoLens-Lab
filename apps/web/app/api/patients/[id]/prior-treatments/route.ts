import 'server-only';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../lib/server/registro-manual';

// Route Handler (POST): registra a mano un tratamiento previo (US-094). Verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(
    dependenciasDeEntorno(),
    'createManualPriorTreatment',
  );
  return manejador(request, await contexto.params);
}
