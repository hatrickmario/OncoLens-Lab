import { render } from '@testing-library/react';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import atributoCorregido from '../../../../contracts/examples/clinical-attribute-corregido.json';
import atributosPermitidos from '../../../../contracts/examples/clinical-attributes-list.json';
import casoDelContrato from '../../../../contracts/examples/case-view.json';
import errorCorreccionFechaFin from '../../../../contracts/examples/error-correccion-fecha-fin.json';
import errorDatoNoVigente from '../../../../contracts/examples/error-dato-no-vigente.json';
import errorDeclaracionIncoherente from '../../../../contracts/examples/error-declaracion-incoherente.json';
import errorValorFueraDeCatalogo from '../../../../contracts/examples/error-valor-fuera-de-catalogo-campo.json';
import historicoDeAtributo from '../../../../contracts/examples/correction-history-clinical-attribute.json';
import historicoDeTratamiento from '../../../../contracts/examples/correction-history-prior-treatment.json';
import tratamientoCorregido from '../../../../contracts/examples/prior-treatment-corregido.json';
import { VistaDeCaso } from '../../components/organisms/vista-de-caso';
import { checklistSinFaltantes, HOY, ID_DEL_CASO } from './caso-ui';

export {
  atributosPermitidos,
  errorCorreccionFechaFin,
  errorDatoNoVigente,
  errorDeclaracionIncoherente,
  errorValorFueraDeCatalogo,
  historicoDeAtributo,
  historicoDeTratamiento,
  HOY,
};

/** Ids de las filas vigentes de las que parte el caso: son los de los ejemplos del histórico del contrato. */
export const ID_TRATAMIENTO = historicoDeTratamiento.items[0]!.id;
export const ID_ATRIBUTO = historicoDeAtributo.items[0]!.id;
export const ID_DECLARACION = 'c0ffee00-5e4a-4b8c-9dae-2a3b4c5d6e7f';

const procedencia = tratamientoCorregido.provenance;
const manual = { ...procedencia, entryMethod: 'manual' as const };

/** Tratamiento vigente de partida (esquema «AC-T»), con la forma de `CaseView.priorTreatments[]`. */
export const tratamientoVigente = {
  id: ID_TRATAMIENTO,
  lineNumber: 1,
  setting: 'adyuvante',
  regimenName: 'AC-T',
  atcCodes: [],
  startedAt: '2026-03-10',
  endedAt: '2026-07-14',
  ongoing: false,
  endReason: 'completado',
  provenance: manual,
};

export const atributoVigente = {
  id: ID_ATRIBUTO,
  key: 'estado_castracion',
  value: 'sensible_castracion',
  observedAt: '2026-08-20',
  provenance: manual,
};

export const declaracionVigente = {
  id: ID_DECLARACION,
  key: 'sin_tratamiento_previo',
  value: 'si',
  observedAt: '2026-09-02',
  provenance: manual,
};

const base = { ...casoDelContrato, timeline: [], biomarkerSeries: [] };
export const casoConDatos = {
  ...base,
  priorTreatments: [tratamientoVigente],
  attributes: [atributoVigente],
};
export const casoConDeclaracion = {
  ...base,
  priorTreatments: [],
  attributes: [declaracionVigente],
};
export const casoSinDatos = { ...base, priorTreatments: [], attributes: [] };

/** Fila nueva que deja la corrección del tratamiento: lo que devolvería el servidor, con la forma de la vista. */
const filaDeTratamientoCorregido: Record<string, unknown> = { ...tratamientoCorregido };
delete filaDeTratamientoCorregido.mappingStatus;
export const tratamientoNuevo = { ...filaDeTratamientoCorregido, supersedesId: ID_TRATAMIENTO };
export const atributoNuevo = {
  ...atributoCorregido,
  key: 'estado_castracion',
  value: 'castrado',
  supersedesId: ID_ATRIBUTO,
};

export interface PeticionAlBff {
  metodo: string;
  ruta: string;
  cuerpo: unknown;
}

type Caso = typeof casoConDatos;

/**
 * BFF de la vista de caso en el borde HTTP (MSW): el `GET /case` devuelve lo que dejan los `201` de corrección, como el
 * servidor, para comprobar que la fila nueva aparece al recargar la vista sin recargar la página.
 */
export function crearBffDeCorreccionDeCaso(inicial: object = casoConDatos) {
  const servidor = setupServer();
  const peticiones: PeticionAlBff[] = [];
  let caso = inicial as Caso;
  const anotar = async (request: Request): Promise<void> => {
    const texto = await request.text();
    peticiones.push({
      metodo: request.method,
      ruta: new URL(request.url).pathname,
      cuerpo: texto === '' ? null : (JSON.parse(texto) as unknown),
    });
  };
  const lecturas = () => [
    http.get('*/api/patients/:id/case', () => HttpResponse.json(caso)),
    checklistSinFaltantes(),
    http.get('*/api/patients/:id/clinical-attributes', () =>
      HttpResponse.json(atributosPermitidos),
    ),
  ];
  const responder = (
    metodo: 'get' | 'post',
    ruta: string,
    status: number,
    cuerpo: JsonBodyType,
    alAceptar?: () => void,
  ) =>
    servidor.use(
      http[metodo](`*/api/patients/:id/${ruta}`, async ({ request }) => {
        await anotar(request);
        if (status === 201) alAceptar?.();
        return HttpResponse.json(cuerpo, { status });
      }),
    );
  servidor.use(...lecturas());
  return {
    peticiones,
    envios: () => peticiones.filter((p) => p.metodo === 'POST'),
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: (nuevo: object = inicial) => {
      servidor.resetHandlers();
      peticiones.length = 0;
      caso = nuevo as Caso;
      servidor.use(...lecturas());
    },
    corregirTratamiento: (status: number, cuerpo: JsonBodyType = tratamientoNuevo) =>
      responder('post', 'prior-treatments/:tratamiento/corrections', status, cuerpo, () => {
        caso = { ...caso, priorTreatments: [tratamientoNuevo] } as unknown as Caso;
      }),
    corregirAtributo: (status: number, cuerpo: JsonBodyType = atributoNuevo) =>
      responder('post', 'clinical-attributes/:atributo/corrections', status, cuerpo, () => {
        caso = { ...caso, attributes: [atributoNuevo] } as unknown as Caso;
      }),
    historicoDeTratamiento: (cuerpo: JsonBodyType = historicoDeTratamiento) =>
      responder('get', 'prior-treatments/:tratamiento/history', 200, cuerpo),
    historicoDeAtributo: (cuerpo: JsonBodyType = historicoDeAtributo) =>
      responder('get', 'clinical-attributes/:atributo/history', 200, cuerpo),
  };
}

export const montarCasoParaCorregir = (egresado = false) =>
  render(<VistaDeCaso patientId={ID_DEL_CASO} hoy={HOY} egresado={egresado} />);
