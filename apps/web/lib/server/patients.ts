import 'server-only';
import type { DependenciasDelBff } from './dependencias';
import { respuestaPropia } from './respuestas';

type Manejador = (request: Request) => Promise<Response>;

export function crearManejadorListadoDePacientes(_dependencias: DependenciasDelBff): Manejador {
  return () => Promise.resolve(respuestaPropia({ error: 'no implementado' }, 501));
}

export function crearManejadorBusquedaDePacientes(_dependencias: DependenciasDelBff): Manejador {
  return () => Promise.resolve(respuestaPropia({ error: 'no implementado' }, 501));
}
