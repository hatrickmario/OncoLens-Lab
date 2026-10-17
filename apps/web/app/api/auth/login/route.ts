import 'server-only';
import { dependenciasDeEntorno } from '../../../../lib/server/dependencias';
import { crearManejadorLogin } from '../../../../lib/server/auth-login';

// Route Handler del login: el navegador solo habla con web. Retransmite la cookie de sesión que fija clinical-api.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return crearManejadorLogin(dependenciasDeEntorno())(request);
}
