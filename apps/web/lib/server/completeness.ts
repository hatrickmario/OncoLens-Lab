import 'server-only';
import type { DependenciasDelBff } from './dependencias';

/** Esqueleto (rojo del AC): el proxy del checklist llega con el commit `feat(L1D-97)`. */
export function crearManejadorChecklist(
  _dependencias: DependenciasDelBff,
): (request: Request, patientId: string) => Promise<Response> {
  return () => {
    throw new Error('no implementado');
  };
}
