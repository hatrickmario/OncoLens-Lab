import 'server-only';
import { dependenciasDeEntorno } from '../../../lib/server/dependencias';
import { crearManejadorListadoDePacientes } from '../../../lib/server/patients';

// Route Handler (GET): el navegador solo habla con web. Sin caché: el listado lleva identidad enmascarada.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Promise<Response> {
  return crearManejadorListadoDePacientes(dependenciasDeEntorno())(request);
}
