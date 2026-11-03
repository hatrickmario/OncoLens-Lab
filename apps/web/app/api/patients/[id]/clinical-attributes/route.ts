import 'server-only';
import { dependenciasDeEntorno } from '../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../lib/server/registro-manual';

// Route Handlers (GET, POST): atributos clínicos vigentes con los permitidos del catálogo, y registro manual de uno
// (US-094). Sin caché: es dato clínico (RN-10). El POST verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(dependenciasDeEntorno(), 'listClinicalAttributes');
  return manejador(request, await contexto.params);
}

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(
    dependenciasDeEntorno(),
    'createManualClinicalAttribute',
  );
  return manejador(request, await contexto.params);
}
