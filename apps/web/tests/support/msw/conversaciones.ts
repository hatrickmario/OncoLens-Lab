import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import apertura from '../../../../../contracts/examples/conversation-create-response.json';
import turnoDeCaso from '../../../../../contracts/examples/conversation-turn.json';
import turnoDeEvidencia from '../../../../../contracts/examples/conversation-turn-evidencia.json';
import errorOptOut from '../../../../../contracts/examples/error-opt-out.json';
import errorTurno503 from '../../../../../contracts/examples/error-conversation-turn-503.json';
import casoDelPaciente from '../../../../../contracts/examples/case-view.json';
import historicoDeBiomarcador from '../../../../../contracts/examples/correction-history-biomarker.json';
import turnoFaltantes from '../../../../../contracts/examples/chat-turn-faltantes.json';
import turnoSinDatos from '../../../../../contracts/examples/chat-turn-caso-sin-datos.json';
import turnoContextual from '../../../../../contracts/examples/chat-turn-evidencia-contextual.json';
import analisisSinOpciones from '../../../../../contracts/examples/con-evidencia-sin-opciones.json';
import turnoSinOpciones from '../../../../../contracts/examples/chat-turn-evidencia-sin-opciones.json';
import turnoFueraDeAlcance from '../../../../../contracts/examples/chat-turn-fuera-de-alcance.json';
import turnoInterpretacion from '../../../../../contracts/examples/chat-turn-caso-interpretacion.json';
import { URL_CLINICAL_API } from '../clinical-api-simulado';

export {
  analisisSinOpciones,
  apertura,
  casoDelPaciente,
  historicoDeBiomarcador,
  errorOptOut,
  errorTurno503,
  turnoDeCaso,
  turnoDeEvidencia,
  turnoContextual,
  turnoFaltantes,
  turnoFueraDeAlcance,
  turnoInterpretacion,
  turnoSinDatos,
  turnoSinOpciones,
};

export interface RespuestaDeTurno {
  status: number;
  cuerpo: object;
  /** La respuesta espera a esta promesa: así un test fija «petición en curso» sin temporizadores. */
  compuerta?: Promise<void>;
  /** Fallo de red: no hay respuesta HTTP. */
  red?: true;
}

/** Compuerta que el test abre cuando quiere liberar la respuesta retenida. */
export function crearCompuerta() {
  let abrir: () => void = () => {};
  const promesa = new Promise<void>((resolver) => {
    abrir = resolver;
  });
  return { promesa, abrir };
}

/**
 * Rutas de conversación del BFF simuladas en el borde HTTP (MSW) con los ejemplos del contrato (`contracts/examples/`).
 * Las respuestas de turno se sirven en orden y la última se repite. Cualquier otra ruta, incluida
 * `…/follow-ups`, se registra y responde 500: un test comprueba que no se llamó.
 */
export function crearBffConversacionSimulado() {
  const servidor = setupServer();
  const aperturas: string[] = [];
  const turnos: { url: string; cuerpo: Record<string, unknown> }[] = [];
  const seguimientos: string[] = [];
  /** Lecturas del panel lateral por el BFF (`…/case` y `…/history`): un test comprueba qué se pidió. */
  const casos: string[] = [];
  const historicos: string[] = [];
  const porDefecto = () => [
    http.post('*/api/patients/:id/conversations', ({ request }) => {
      aperturas.push(request.url);
      return HttpResponse.json(apertura, { status: 201 });
    }),
    http.post('*/api/evidence-analyses/:id/follow-ups', ({ request }) => {
      seguimientos.push(request.url);
      return HttpResponse.json({ error: 'INTERNO' }, { status: 500 });
    }),
  ];
  return {
    aperturas,
    turnos,
    seguimientos,
    casos,
    historicos,
    iniciar: () => {
      servidor.use(...porDefecto());
      servidor.listen({ onUnhandledFrame: 'error' });
    },
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers(...porDefecto());
      aperturas.length = 0;
      turnos.length = 0;
      seguimientos.length = 0;
      casos.length = 0;
      historicos.length = 0;
    },
    /** `GET /api/patients/{id}/case` del BFF (lo que lee el panel lateral al abrir un dato). */
    responderCaso: ({ status, cuerpo }: { status: number; cuerpo: object }) =>
      servidor.use(
        http.get('*/api/patients/:id/case', ({ request }) => {
          casos.push(request.url);
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
    /** `GET /api/patients/{id}/{dato}/{rid}/history` del BFF. */
    responderHistorico: ({ status, cuerpo }: { status: number; cuerpo: object }) =>
      servidor.use(
        http.get('*/api/patients/:id/:dato/:rid/history', ({ request }) => {
          historicos.push(request.url);
          return HttpResponse.json(cuerpo, { status });
        }),
      ),
    /** `GET /platform/patients/{id}` de clinical-api (lo que lee `obtenerFicha` en el RSC de la página). */
    responderFicha: ({ status, cuerpo }: { status: number; cuerpo: object }) =>
      servidor.use(
        http.get(`${URL_CLINICAL_API}/platform/patients/:id`, () =>
          HttpResponse.json(cuerpo, { status }),
        ),
      ),
    responderTurnos: (...respuestas: RespuestaDeTurno[]) => {
      let siguiente = 0;
      servidor.use(
        http.post('*/api/conversations/:id/turns', async ({ request }) => {
          turnos.push({
            url: request.url,
            cuerpo: (await request.json()) as Record<string, unknown>,
          });
          const { status, cuerpo, compuerta, red } =
            respuestas[Math.min(siguiente++, respuestas.length - 1)]!;
          await compuerta;
          return red ? HttpResponse.error() : HttpResponse.json(cuerpo, { status });
        }),
      );
    },
  };
}
