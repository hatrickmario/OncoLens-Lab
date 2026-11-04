import { render } from '@testing-library/react';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import atributoManual from '../../../../contracts/examples/clinical-attribute-manual.json';
import atributosPermitidos from '../../../../contracts/examples/clinical-attributes-list.json';
import errorCampo from '../../../../contracts/examples/error-registro-clinico-campo.json';
import errorPermisoDenegado from '../../../../contracts/examples/error-permiso-denegado.json';
import tratamientoCreado from '../../../../contracts/examples/prior-treatment-manual-creado.json';
import tratamientoManual from '../../../../contracts/examples/prior-treatment-manual.json';
import tratamientoNoMapeado from '../../../../contracts/examples/prior-treatment-no-mapeado.json';
import { VistaDeCaso } from '../../components/organisms/vista-de-caso';
import { casoVacio, checklistSinFaltantes, HOY, ID_DEL_CASO } from './caso-ui';

export {
  atributoManual,
  atributosPermitidos,
  errorCampo,
  errorPermisoDenegado,
  tratamientoCreado,
  tratamientoManual,
  tratamientoNoMapeado,
};

export interface PeticionAlBff {
  metodo: string;
  ruta: string;
  cuerpo: unknown;
}

type Caso = typeof casoVacio;

/**
 * BFF de la vista de caso simulado en el borde HTTP (MSW): el `GET /case` devuelve el estado que dejan los `201`,
 * como lo haría el servidor, para comprobar que la fila aparece al recargar la vista sin recargar la página.
 */
export function crearBffDeRegistroSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionAlBff[] = [];
  let caso: Caso = casoVacio;
  const registrar = async (request: Request): Promise<void> => {
    const texto = await request.text();
    peticiones.push({
      metodo: request.method,
      ruta: new URL(request.url).pathname,
      cuerpo: texto === '' ? null : (JSON.parse(texto) as unknown),
    });
  };
  const leerCaso = () =>
    http.get('*/api/patients/:id/case', async ({ request }) => {
      await registrar(request);
      return HttpResponse.json(caso);
    });
  const responderPost = (
    ruta: string,
    status: number,
    cuerpo: JsonBodyType,
    alCrear?: () => void,
  ) =>
    servidor.use(
      http.post(`*/api/patients/:id/${ruta}`, async ({ request }) => {
        await registrar(request);
        if (status === 201) alCrear?.();
        return HttpResponse.json(cuerpo, { status });
      }),
    );
  servidor.use(leerCaso(), checklistSinFaltantes());
  return {
    peticiones,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
      caso = casoVacio;
      servidor.use(leerCaso(), checklistSinFaltantes());
    },
    crearTratamiento: (cuerpo: typeof tratamientoCreado | typeof tratamientoNoMapeado) =>
      responderPost('prior-treatments', 201, cuerpo, () => {
        // La vista de caso no trae `id` ni `mappingStatus` del tratamiento (CaseView): se proyecta como lo haría el servidor.
        const fila: Record<string, unknown> = { ...cuerpo };
        delete fila.id;
        delete fila.mappingStatus;
        caso = { ...casoVacio, priorTreatments: [fila] } as unknown as Caso;
      }),
    rechazarTratamiento: (status: number, cuerpo: JsonBodyType) =>
      responderPost('prior-treatments', status, cuerpo),
    permitidos: (status = 200, cuerpo: JsonBodyType = atributosPermitidos) =>
      servidor.use(
        http.get('*/api/patients/:id/clinical-attributes', async ({ request }) => {
          await registrar(request);
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
    rechazarAtributo: (status: number, cuerpo: JsonBodyType) =>
      responderPost('clinical-attributes', status, cuerpo),
  };
}

export const montarCasoConRegistro = (egresado = false) =>
  render(<VistaDeCaso patientId={ID_DEL_CASO} hoy={HOY} egresado={egresado} />);
