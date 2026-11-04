import { render } from '@testing-library/react';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import checklistF_M1 from '../../../../contracts/examples/completeness-f-m1.json';
import checklistF_M2 from '../../../../contracts/examples/completeness-f-m2.json';
import checklistKi67Registrado from '../../../../contracts/examples/completeness-f-m2-ki67-registrado.json';
import checklistTipoNoHabilitado from '../../../../contracts/examples/completeness-tipo-no-habilitado.json';
import atributosPermitidos from '../../../../contracts/examples/clinical-attributes-list.json';
import opcionesMama from '../../../../contracts/examples/manual-entry-options-mama.json';
import { VistaDeCaso } from '../../components/organisms/vista-de-caso';
import { casoPCaso, errorInterno, errorNoAutenticado, HOY, ID_DEL_CASO } from './caso-ui';
import { biomarcadorCreado } from './registro-manual-formularios-ui';

export {
  atributosPermitidos,
  checklistF_M1,
  checklistF_M2,
  checklistKi67Registrado,
  checklistTipoNoHabilitado,
  errorInterno,
  errorNoAutenticado,
  ID_DEL_CASO,
};

/**
 * BFF de la vista de caso con checklist, simulado en el borde HTTP (MSW) con los ejemplos del contrato: `GET /case`,
 * `GET /completeness` (el test fija la respuesta, también una segunda tras guardar), opciones de registro manual y
 * atributos permitidos. Lo no declarado falla (`onUnhandledFrame: 'error'`).
 */
export function crearBffDeDatosCriticosSimulado() {
  const servidor = setupServer();
  const rutas: string[] = [];
  const marcar = (request: Request) => rutas.push(new URL(request.url).pathname);
  const checklist = (status: number, cuerpo: JsonBodyType) =>
    http.get('*/api/patients/:id/completeness', ({ request }) => {
      marcar(request);
      return HttpResponse.json(cuerpo, { status });
    });
  const predeterminados = () =>
    servidor.use(
      http.get('*/api/patients/:id/case', ({ request }) => {
        marcar(request);
        return HttpResponse.json(casoPCaso);
      }),
      checklist(200, checklistF_M2),
      http.get('*/api/patients/:id/manual-entry-options', ({ request }) => {
        marcar(request);
        return HttpResponse.json(opcionesMama);
      }),
      http.get('*/api/patients/:id/clinical-attributes', ({ request }) => {
        marcar(request);
        return HttpResponse.json(atributosDeMama);
      }),
    );
  predeterminados();
  return {
    rutas,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      rutas.length = 0;
      predeterminados();
    },
    responderChecklist: (status: number, cuerpo: JsonBodyType) =>
      servidor.use(checklist(status, cuerpo)),
    /** El `201` del biomarcador deja el checklist con Ki-67 registrado: la relectura lo refleja. */
    crearKi67: () =>
      servidor.use(
        http.post('*/api/patients/:id/biomarkers', ({ request }) => {
          marcar(request);
          servidor.use(checklist(200, checklistKi67Registrado));
          return HttpResponse.json(biomarcadorCreado, { status: 201 });
        }),
      ),
    responderCaso: (status: number, cuerpo: JsonBodyType) =>
      servidor.use(
        http.get('*/api/patients/:id/case', ({ request }) => {
          marcar(request);
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
  };
}

/** Atributos del catálogo de mama: el ejemplo del contrato (próstata) más `estado_menopausico`, como lo listaría el servidor. */
export const atributosDeMama = {
  ...atributosPermitidos,
  allowedAttributes: [
    {
      key: 'estado_menopausico',
      label: 'Estado menopáusico',
      values: [
        { value: 'premenopausica', label: 'Premenopáusica' },
        { value: 'posmenopausica', label: 'Posmenopáusica' },
      ],
    },
    ...atributosPermitidos.allowedAttributes,
  ],
};

/** Enlaces y botones de un elemento: las acciones que ofrece una fila o la columna. */
export const accionesDe = (elemento: HTMLElement) =>
  Array.from(elemento.querySelectorAll<HTMLElement>('a[href], button'));

export const montarVistaConDatosCriticos = (item?: string, egresado = false) =>
  render(<VistaDeCaso patientId={ID_DEL_CASO} hoy={HOY} item={item} egresado={egresado} />);
