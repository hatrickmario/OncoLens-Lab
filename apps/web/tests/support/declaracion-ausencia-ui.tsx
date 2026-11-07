import { render } from '@testing-library/react';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import atributoCreado from '../../../../contracts/examples/clinical-attribute-creado.json';
import checklistDeclarado from '../../../../contracts/examples/completeness-sin-tratamiento-previo.json';
import errorValorFueraDeCatalogo from '../../../../contracts/examples/error-valor-fuera-de-catalogo-campo.json';
import errorIncoherente from '../../../../contracts/examples/error-declaracion-incoherente.json';
import { VistaDeCaso } from '../../components/organisms/vista-de-caso';
import { casoPCaso, casoVacio, HOY, ID_DEL_CASO } from './caso-ui';

export { casoPCaso, casoVacio, checklistDeclarado, errorIncoherente, HOY, ID_DEL_CASO };

/** 422 `VALOR_FUERA_DE_CATALOGO` sobre `attributeKey` (clave no permitida para el tipo de cáncer): mismo `field` que la incoherencia. */
export const errorClaveFueraDeCatalogo = {
  ...errorValorFueraDeCatalogo,
  field: 'attributeKey',
};

/** El ítem del ejemplo del contrato, sin tratamientos ni declaración: el estado que ve el oncólogo antes de declarar. */
export const checklistFaltante = {
  ...checklistDeclarado,
  items: checklistDeclarado.items.map((i) =>
    i.item === 'tratamientos_previos'
      ? {
          item: i.item,
          label: i.label,
          status: 'faltante',
          gapType: 'no_buscado',
          origin: 'regla',
          provenance: null,
          destination: i.destination,
          condition: i.condition,
        }
      : i,
  ),
};

/** Procedencia de un registro manual verificado: la del `201` de atributo clínico del contrato. */
const procedenciaManual = atributoCreado.provenance;

export const declaracionVigente = {
  id: atributoCreado.id,
  key: 'sin_tratamiento_previo',
  value: 'si',
  observedAt: HOY,
  provenance: procedenciaManual,
};

export const casoConDeclaracion = { ...casoVacio, attributes: [declaracionVigente] };

/** Declaración vigente sin fecha de observación: distinta de «sin declaración». */
export const casoConDeclaracionSinFecha = {
  ...casoVacio,
  attributes: [{ ...declaracionVigente, observedAt: null }],
};

/** El ítem «Tratamientos previos» presente pero sin verificar: no es un faltante, así que no ofrece acción. */
export const checklistSinVerificar = {
  ...checklistDeclarado,
  items: checklistDeclarado.items.map((i) =>
    i.item === 'tratamientos_previos' ? { ...i, status: 'presente_sin_verificar' } : i,
  ),
};

export interface PeticionAlBff {
  metodo: string;
  ruta: string;
  cuerpo: unknown;
}

interface Estado {
  caso: object;
  checklist: object;
}

/** BFF simulado en el borde HTTP (MSW): `GET /case` y `GET /completeness` devuelven lo que dejan los `201`, como el servidor. */
export function crearBffDeDeclaracionSimulado(inicial: Estado) {
  const servidor = setupServer();
  const peticiones: PeticionAlBff[] = [];
  let estado: Estado = inicial;
  const anotar = async (request: Request) => {
    const texto = await request.text();
    peticiones.push({
      metodo: request.method,
      ruta: new URL(request.url).pathname,
      cuerpo: texto === '' ? null : (JSON.parse(texto) as unknown),
    });
  };
  const lecturas = () => [
    http.get('*/api/patients/:id/case', () => HttpResponse.json(estado.caso as JsonBodyType)),
    http.get('*/api/patients/:id/completeness', () =>
      HttpResponse.json(estado.checklist as JsonBodyType),
    ),
  ];
  servidor.use(...lecturas());
  return {
    peticiones,
    envios: () => peticiones.filter((p) => p.metodo === 'POST'),
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: (nuevo: Estado = inicial) => {
      servidor.resetHandlers();
      peticiones.length = 0;
      estado = nuevo;
      servidor.use(...lecturas());
    },
    /** El `201` deja la declaración vigente en la vista y el checklist. */
    aceptarDeclaracion: () =>
      servidor.use(
        http.post('*/api/patients/:id/clinical-attributes', async ({ request }) => {
          await anotar(request);
          estado = { caso: casoConDeclaracion, checklist: checklistDeclarado };
          return HttpResponse.json(
            { ...atributoCreado, key: 'sin_tratamiento_previo', value: 'si', observedAt: HOY },
            { status: 201 },
          );
        }),
      ),
    rechazarDeclaracion: (status: number, cuerpo: JsonBodyType) =>
      servidor.use(
        http.post('*/api/patients/:id/clinical-attributes', async ({ request }) => {
          await anotar(request);
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
  };
}

export const montarCasoParaDeclarar = () =>
  render(<VistaDeCaso patientId={ID_DEL_CASO} hoy={HOY} egresado={false} />);
