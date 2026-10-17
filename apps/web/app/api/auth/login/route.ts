import 'server-only';
import { dependenciasDeEntorno } from '../../../../lib/server/dependencias';
import { crearManejadorLogin } from './manejador';

// Route Handler del login: el navegador solo habla con web. Retransmite la cookie de sesión que fija clinical-api.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  const { config, fetch, nuevoTraceId } = dependenciasDeEntorno();
  return crearManejadorLogin({
    config,
    fetch,
    nuevoTraceId,
    // Mismo formato de línea que el registro compartido; el login añade su motivo `content_type`.
    registrar: (linea) => console.info(JSON.stringify(linea)),
  })(request);
}
