import 'server-only';
import type { DependenciasDelBff } from './dependencias';

type Manejador = (request: Request, id: string) => Promise<Response>;

/** `POST /api/patients/{id}/conversations` (L1D-315). */
export function crearManejadorAperturaDeConversacion(dependencias: DependenciasDelBff): Manejador {
  void dependencias;
  return () => Promise.reject(new Error('no implementado'));
}

/** `GET /api/conversations/{conversationId}` (L1D-315). */
export function crearManejadorLecturaDeConversacion(dependencias: DependenciasDelBff): Manejador {
  void dependencias;
  return () => Promise.reject(new Error('no implementado'));
}

/** `POST /api/conversations/{conversationId}/turns` (L1D-315). */
export function crearManejadorTurnoDeConversacion(dependencias: DependenciasDelBff): Manejador {
  void dependencias;
  return () => Promise.reject(new Error('no implementado'));
}
