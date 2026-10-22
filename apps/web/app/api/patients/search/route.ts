import 'server-only';
import { dependenciasDeEntorno } from '../../../../lib/server/dependencias';
import { crearManejadorBusquedaDePacientes } from '../../../../lib/server/patients';

// Route Handler (POST): la identidad viaja solo en el cuerpo; verificarOrigen() antes de leerlo. Sin caché.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return crearManejadorBusquedaDePacientes(dependenciasDeEntorno())(request);
}
