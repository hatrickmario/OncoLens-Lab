import 'server-only';
import { consultaDeFiltros, type FiltrosDelListado } from '../pacientes/consulta';
import { interpretarRespuestaDePacientes, type ResultadoDePacientes } from '../pacientes/respuesta';
import { dependenciasDeEntorno, type DependenciasDelBff } from './dependencias';
import { crearManejadorListadoDePacientes } from './patients';

/**
 * Lee el listado para la página (RSC) por el mismo manejador que `GET /api/patients`: una sola ruta hacia
 * clinical-api, con la cookie de sesión como único dato reenviado, `no-store` y el mismo log sin filtros ni identidad.
 */
export async function leerListadoDePacientes(
  cabeceraCookie: string | null,
  filtros: FiltrosDelListado,
  dependencias: DependenciasDelBff = dependenciasDeEntorno(),
): Promise<ResultadoDePacientes> {
  const consulta = consultaDeFiltros(filtros);
  const peticion = new Request(
    `http://web.interno/api/patients${consulta === '' ? '' : `?${consulta}`}`,
    {
      headers: cabeceraCookie === null ? {} : { cookie: cabeceraCookie },
    },
  );
  const respuesta = await crearManejadorListadoDePacientes(dependencias)(peticion);
  return interpretarRespuestaDePacientes(
    respuesta.status,
    await respuesta.text(),
    respuesta.headers.get('x-trace-id'),
  );
}
