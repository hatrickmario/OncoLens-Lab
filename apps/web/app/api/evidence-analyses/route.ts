import 'server-only';
import { dependenciasDeEntorno } from '../../../lib/server/dependencias';
import { crearManejadorAnalisis } from '../../../lib/server/evidence-analyses';

// Route Handler, no Server Action (readme §2.1): el navegador solo habla con web. Sin caché ni streaming.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return crearManejadorAnalisis(dependenciasDeEntorno())(request);
}
