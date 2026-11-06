import 'server-only';
import { dependenciasDeEntorno } from '../../../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../../../lib/server/registro-manual';

// Route Handler (GET): versiones reemplazadas de un tratamiento previo. Sin caché: es dato clínico (RN-10).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  contexto: { params: Promise<{ id: string; treatmentId: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(
    dependenciasDeEntorno(),
    'getPriorTreatmentHistory',
  );
  return manejador(request, await contexto.params);
}
