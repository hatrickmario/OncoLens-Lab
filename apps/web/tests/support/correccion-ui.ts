import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import biomarcadorCorregido from '../../../../contracts/examples/biomarker-corrected.json';
import corregidaNota from '../../../../contracts/examples/clinical-note-corrected.json';
import errorDatoNoVigente from '../../../../contracts/examples/error-dato-no-vigente.json';
import errorFechaFutura from '../../../../contracts/examples/error-correccion-fecha-futura.json';
import errorPermisoDenegado from '../../../../contracts/examples/error-permiso-denegado.json';
import historicoDeBiomarcador from '../../../../contracts/examples/correction-history-biomarker.json';
import historicoDeNota from '../../../../contracts/examples/correction-history-clinical-note.json';
import listaDeNotas from '../../../../contracts/examples/clinical-notes-list.json';

export {
  biomarcadorCorregido,
  corregidaNota,
  errorDatoNoVigente,
  errorFechaFutura,
  errorPermisoDenegado,
  historicoDeBiomarcador,
  historicoDeNota,
  listaDeNotas,
};

export const ID_DEL_PACIENTE = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';

export interface PeticionAlBff {
  url: string;
  metodo: string;
  cuerpo: unknown;
}

/** Rutas `/api/patients/{id}/…` de corrección y de histórico del BFF, simuladas en el borde HTTP (MSW). */
export function crearBffDeCorreccionSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionAlBff[] = [];
  const capturar = async (request: Request): Promise<void> => {
    const texto = await request.text();
    peticiones.push({
      url: request.url,
      metodo: request.method,
      cuerpo: texto === '' ? null : (JSON.parse(texto) as unknown),
    });
  };
  const publicar = (metodo: 'get' | 'post', ruta: string, status: number, cuerpo: JsonBodyType) =>
    servidor.use(
      http[metodo](`*/api/patients/:paciente/${ruta}`, async ({ request }) => {
        await capturar(request);
        return HttpResponse.json(cuerpo, { status });
      }),
    );
  return {
    peticiones,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
    },
    corregirBiomarcador: (status: number, cuerpo: JsonBodyType) =>
      publicar('post', 'biomarkers/:id/corrections', status, cuerpo),
    historicoDeBiomarcador: (cuerpo: JsonBodyType, status = 200) =>
      publicar('get', 'biomarkers/:id/history', status, cuerpo),
    corregirNota: (status: number, cuerpo: JsonBodyType) =>
      publicar('post', 'clinical-notes/:id/corrections', status, cuerpo),
    historicoDeNota: (cuerpo: JsonBodyType, status = 200) =>
      publicar('get', 'clinical-notes/:id/history', status, cuerpo),
    historicoDeTratamiento: (cuerpo: JsonBodyType, status = 200) =>
      publicar('get', 'prior-treatments/:id/history', status, cuerpo),
    historicoDeAtributo: (cuerpo: JsonBodyType, status = 200) =>
      publicar('get', 'clinical-attributes/:id/history', status, cuerpo),
  };
}
