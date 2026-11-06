import 'server-only';
import { dependenciasDeEntorno } from '../../../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../../../lib/server/registro-manual';

// Route Handler (POST): corrige un tratamiento previo vigente conservando el anterior (d5fb-05). Verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string; treatmentId: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(
    dependenciasDeEntorno(),
    'correctPriorTreatment',
  );
  return manejador(request, await contexto.params);
}
