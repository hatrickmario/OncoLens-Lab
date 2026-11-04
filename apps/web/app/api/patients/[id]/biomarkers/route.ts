import 'server-only';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../lib/server/registro-manual';

// Route Handler (POST): registro manual de un biomarcador (US-111). Sin caché: es dato clínico (RN-10). El POST verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(
    dependenciasDeEntorno(),
    'createManualBiomarker',
  );
  return manejador(request, await contexto.params);
}
