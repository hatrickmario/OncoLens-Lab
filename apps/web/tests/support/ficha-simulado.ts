import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import diagnosticoConGradaciones from '../../../../contracts/examples/diagnosis-con-gradings.json';
import errorInterno from '../../../../contracts/examples/error-interno.json';
import errorNoAutenticado from '../../../../contracts/examples/error-no-autenticado.json';
import errorNoEncontrado from '../../../../contracts/examples/error-no-encontrado.json';
import fichaAdmin from '../../../../contracts/examples/patient-summary-admin.json';
import fichaDelDoctor from '../../../../contracts/examples/patient-summary-doctor.json';
import { URL_CLINICAL_API } from './clinical-api-simulado';

export {
  diagnosticoConGradaciones,
  errorInterno,
  errorNoAutenticado,
  errorNoEncontrado,
  fichaAdmin,
  fichaDelDoctor,
};

export const ID_DE_FICHA = fichaDelDoctor.id;

const [primerBiomarcador] = fichaDelDoctor.recentBiomarkers;
if (primerBiomarcador === undefined) throw new Error('El ejemplo no trae biomarcadores');

/** Segundo biomarcador derivado del ejemplo del contrato: dato manual por revisar (otra id y procedencia). */
export const biomarcadorManualPorRevisar = {
  ...primerBiomarcador,
  id: '9b2d0f55-6c3e-4d4f-9a71-2e3f4a5b6c7d',
  name: 'RE',
  value: 'positivo',
  provenance: {
    ...primerBiomarcador.provenance,
    entryMethod: 'manual' as const,
    reviewStatus: 'requiere_revision' as const,
  },
};

export const biomarcadorSinVerificar = {
  ...biomarcadorManualPorRevisar,
  provenance: { ...primerBiomarcador.provenance, reviewStatus: 'auto_aceptado' as const },
};

export interface RespuestaDeFicha {
  status: number;
  cuerpo: JsonBodyType;
}

/** `GET /platform/patients/{id}` de clinical-api simulado en el borde HTTP (MSW). */
export function crearFichaSimulada() {
  const servidor = setupServer();
  const peticiones: { url: string; cookie: string | null }[] = [];
  return {
    peticiones,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
    },
    responder: ({ status, cuerpo }: RespuestaDeFicha) =>
      servidor.use(
        http.get(`${URL_CLINICAL_API}/platform/patients/:id`, ({ request }) => {
          peticiones.push({ url: request.url, cookie: request.headers.get('cookie') });
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
  };
}
