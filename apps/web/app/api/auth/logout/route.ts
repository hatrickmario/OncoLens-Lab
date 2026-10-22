import 'server-only';
import { crearManejadorLogout } from '../../../../lib/server/auth-logout';
import { dependenciasDeEntorno } from '../../../../lib/server/dependencias';

// Route Handler del cierre de sesión: el navegador solo habla con web (CSRF: verificarOrigen antes de contactar a clinical-api).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return crearManejadorLogout(dependenciasDeEntorno())(request);
}
