import { render } from '@testing-library/react';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import checklistF_M1 from '../../../../contracts/examples/completeness-f-m1.json';
import casoPCaso from '../../../../contracts/examples/case-view-p-caso.json';
import errorInterno from '../../../../contracts/examples/error-interno.json';
import errorPermisoDenegado from '../../../../contracts/examples/error-permiso-denegado.json';
import errorNoAutenticado from '../../../../contracts/examples/error-no-autenticado.json';
import errorNoEncontrado from '../../../../contracts/examples/error-no-encontrado.json';
import { VistaDeCaso } from '../../components/organisms/vista-de-caso';
import { CaseViewTemplate } from '../../components/templates/case-view-template';

export { casoPCaso, errorInterno, errorNoAutenticado, errorNoEncontrado, errorPermisoDenegado };

export const ID_DEL_CASO = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';
/** Reloj congelado de FX-02b-a (design D5): las fechas relativas se calculan contra este día. */
export const HOY = '2026-10-01';

/** `GET /api/patients/{id}/completeness` que la vista de caso lee junto al caso: sin faltantes, para no ensuciar otras pruebas. */
export const checklistSinFaltantes = () =>
  http.get('*/api/patients/:id/completeness', () => HttpResponse.json(checklistF_M1));

export const casoVacio = {
  ...casoPCaso,
  timeline: [],
  priorTreatments: [],
  attributes: [],
  biomarkerSeries: [],
};

/** `GET /api/patients/{id}/case` de web simulado en el borde HTTP (MSW) con los ejemplos del contrato. */
export function crearCasoUiSimulado() {
  const servidor = setupServer(checklistSinFaltantes());
  const peticiones: string[] = [];
  const responder = (status: number, cuerpo: JsonBodyType) =>
    servidor.use(
      http.get('*/api/patients/:id/case', ({ request }) => {
        const url = new URL(request.url);
        peticiones.push(url.pathname + url.search);
        return HttpResponse.json(cuerpo, { status });
      }),
    );
  return {
    peticiones,
    responder,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
    },
  };
}

export const montarVistaDeCaso = () => render(<VistaDeCaso patientId={ID_DEL_CASO} hoy={HOY} />);

/** La página completa sin su barra de paciente: plantilla con la acción de analizar y la vista de caso. */
export const montarPaginaDeCaso = () =>
  render(
    <CaseViewTemplate patientId={ID_DEL_CASO}>
      <VistaDeCaso patientId={ID_DEL_CASO} hoy={HOY} />
    </CaseViewTemplate>,
  );
