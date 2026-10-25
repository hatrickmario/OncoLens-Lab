import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import errorInterno from '../../../../contracts/examples/error-interno.json';
import errorNoAutenticado from '../../../../contracts/examples/error-no-autenticado.json';
import paginaDelDoctor from '../../../../contracts/examples/patient-page-doctor.json';

export { errorInterno, errorNoAutenticado, paginaDelDoctor };

const [primero] = paginaDelDoctor.items;
if (primero === undefined) throw new Error('El ejemplo patient-page-doctor.json no trae elementos');
export const pacienteDelEjemplo = primero;

/** Segundo paciente derivado del ejemplo del contrato (otro id, otra máscara), para listas de dos filas. */
export const otroPaciente = {
  ...pacienteDelEjemplo,
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  nationalIdMasked: '•••• 02',
  fullNameMasked: 'P. S. 2.',
  birthYear: 1971,
};

/** Página del ejemplo con `total` mayor que sus elementos: 3 pacientes en páginas de 2 → "Página 1 de 2". */
export const paginaDeTres = {
  ...paginaDelDoctor,
  items: [pacienteDelEjemplo, otroPaciente],
  pageSize: 2,
  total: 3,
};

export const paginaVacia = { ...paginaDelDoctor, items: [], total: 0 };

export interface PeticionDeBusqueda {
  url: string;
  metodo: string;
  cuerpo: unknown;
}

/** `POST /api/patients/search` del BFF simulado en el borde HTTP (MSW) con los ejemplos del contrato. */
export function crearBffBusquedaSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionDeBusqueda[] = [];
  return {
    peticiones,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
    },
    responder: (status: number, cuerpo: object) =>
      servidor.use(
        http.post('*/api/patients/search', async ({ request }) => {
          peticiones.push({
            url: request.url,
            metodo: request.method,
            cuerpo: await request.json(),
          });
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
  };
}
