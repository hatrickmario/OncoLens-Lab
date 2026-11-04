import 'server-only';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../lib/server/registro-manual';

// Route Handler (POST): completar o corregir el diagnóstico a mano (US-111). Sin caché: es dato clínico (RN-10). El POST verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(
    dependenciasDeEntorno(),
    'createManualDiagnosis',
  );
  return manejador(request, await contexto.params);
}
