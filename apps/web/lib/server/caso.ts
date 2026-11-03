import 'server-only';
import type { DependenciasDelBff } from './dependencias';

type Manejador = (request: Request, patientId: string) => Promise<Response>;

/** Proxy de `GET /platform/patients/{id}/case` (US-090). */
export function crearManejadorVistaDeCaso(_dependencias: DependenciasDelBff): Manejador {
  return async () => {
    throw new Error('no implementado');
  };
}
