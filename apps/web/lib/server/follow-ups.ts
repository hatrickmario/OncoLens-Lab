import 'server-only';
import type { DependenciasDelBff } from './dependencias';

/** Proxy de `POST /platform/evidence-analyses/{analysisId}/follow-ups` (US-219). */
export function crearManejadorSeguimiento(
  _dependencias: DependenciasDelBff,
): (request: Request, analysisId: string) => Promise<Response> {
  return () => {
    throw new Error('no implementado');
  };
}
