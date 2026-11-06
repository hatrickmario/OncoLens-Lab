import 'server-only';
import { dependenciasDeEntorno } from '../../../../../../../lib/server/dependencias';
import { crearManejadorDeRegistroManual } from '../../../../../../../lib/server/registro-manual';

// Route Handler (POST): corrige el valor o la fecha de un atributo clínico vigente conservando el anterior (d5fb-05).
// Verifica `Origin`.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string; attributeId: string }> },
): Promise<Response> {
  const manejador = crearManejadorDeRegistroManual(
    dependenciasDeEntorno(),
    'correctClinicalAttribute',
  );
  return manejador(request, await contexto.params);
}
