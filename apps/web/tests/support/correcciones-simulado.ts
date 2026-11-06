import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import type { ParametrosDeRuta } from '../../lib/server/registro-manual';
import { ORIGEN_PERMITIDO, URL_CLINICAL_API } from './clinical-api-simulado';

export const ID_PACIENTE = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';
export const ID_BIOMARCADOR = '9d2b6f3a-1c4e-4b78-a5d0-3f4a5b6c7d8e';
export const ID_NOTA = 'b3a9d5e7-4f1c-4a28-b6d0-7c8d9e0f1a2b';
export const PARAMETROS_BIOMARCADOR: ParametrosDeRuta = {
  id: ID_PACIENTE,
  biomarkerId: ID_BIOMARCADOR,
};
export const PARAMETROS_NOTA: ParametrosDeRuta = { id: ID_PACIENTE, noteId: ID_NOTA };
export const ID_TRATAMIENTO = '5b1d7a40-3c2e-4f6a-9b8d-0e1f2a3b4c5d';
export const ID_ATRIBUTO = '7d3f9c62-5e4a-4b8c-9dae-2a3b4c5d6e7f';
export const PARAMETROS_TRATAMIENTO: ParametrosDeRuta = {
  id: ID_PACIENTE,
  treatmentId: ID_TRATAMIENTO,
};
export const PARAMETROS_ATRIBUTO: ParametrosDeRuta = { id: ID_PACIENTE, attributeId: ID_ATRIBUTO };
export const PARAMETROS_PACIENTE: ParametrosDeRuta = { id: ID_PACIENTE };

const BASE = `${URL_CLINICAL_API}/platform/patients/${ID_PACIENTE}`;
export const RUTAS = {
  correccionBiomarcador: `${BASE}/biomarkers/${ID_BIOMARCADOR}/corrections`,
  historicoBiomarcador: `${BASE}/biomarkers/${ID_BIOMARCADOR}/history`,
  notas: `${BASE}/clinical-notes`,
  correccionNota: `${BASE}/clinical-notes/${ID_NOTA}/corrections`,
  historicoNota: `${BASE}/clinical-notes/${ID_NOTA}/history`,
  correccionTratamiento: `${BASE}/prior-treatments/${ID_TRATAMIENTO}/corrections`,
  historicoTratamiento: `${BASE}/prior-treatments/${ID_TRATAMIENTO}/history`,
  correccionAtributo: `${BASE}/clinical-attributes/${ID_ATRIBUTO}/corrections`,
  historicoAtributo: `${BASE}/clinical-attributes/${ID_ATRIBUTO}/history`,
} as const;

export interface PeticionCapturada {
  url: string;
  metodo: string;
  cabeceras: Record<string, string>;
  cuerpo: string;
}

/** clinical-api simulado (MSW) para las nueve operaciones de corrección; captura lo que recibe. */
export function crearCorreccionesSimuladas() {
  const servidor = setupServer();
  const peticiones: PeticionCapturada[] = [];
  const capturar = async (request: Request): Promise<void> => {
    peticiones.push({
      url: request.url,
      metodo: request.method,
      cabeceras: Object.fromEntries(request.headers.entries()),
      cuerpo: await request.text(),
    });
  };
  const responder = (
    metodo: 'get' | 'post',
    ruta: string,
    status: number,
    cuerpo: JsonBodyType,
    cabeceras: Record<string, string> = {},
  ) =>
    servidor.use(
      http[metodo](ruta, async ({ request }) => {
        await capturar(request);
        return HttpResponse.json(cuerpo, { status, headers: cabeceras });
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
    responder,
  };
}

export function peticionDeCorreccion(
  cabeceras: Record<string, string>,
  cuerpo: unknown,
  ruta = 'biomarkers',
): Request {
  return new Request(`${ORIGEN_PERMITIDO}/api/patients/${ID_PACIENTE}/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}

export function peticionDeLectura(cabeceras: Record<string, string> = {}): Request {
  return new Request(`${ORIGEN_PERMITIDO}/api/patients/${ID_PACIENTE}/x`, { headers: cabeceras });
}
