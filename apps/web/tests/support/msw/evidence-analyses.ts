import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import conEvidencia from '../../../../../contracts/examples/con-evidencia-s1.json';
import conEvidenciaSinOpciones from '../../../../../contracts/examples/con-evidencia-sin-opciones.json';
import conEvidenciaSoloDescartadas from '../../../../../contracts/examples/con-evidencia-solo-descartadas.json';
import errorDeadline from '../../../../../contracts/examples/error-deadline-vencido.json';
import errorLlmNoDisponible from '../../../../../contracts/examples/error-llm-local-no-disponible.json';
import errorServicioIa from '../../../../../contracts/examples/error-servicio-ia.json';
import errorTipoCancer from '../../../../../contracts/examples/error-tipo-cancer-no-registrado.json';
import peticion from '../../../../../contracts/examples/evidence-analysis-request.json';
import sinEvidencia from '../../../../../contracts/examples/sin-evidencia.json';
import tipoNoHabilitado from '../../../../../contracts/examples/tipo-no-habilitado.json';

export {
  conEvidencia,
  conEvidenciaSinOpciones,
  conEvidenciaSoloDescartadas,
  errorDeadline,
  errorLlmNoDisponible,
  errorServicioIa,
  errorTipoCancer,
  peticion,
  sinEvidencia,
  tipoNoHabilitado,
};

export interface Respuesta {
  status: number;
  cuerpo: object;
}

/**
 * `POST /api/evidence-analyses` del BFF simulado en el borde HTTP (MSW) con los ejemplos del contrato
 * (design D1). Las respuestas se sirven en orden y la última se repite: así una secuencia 503 → 200
 * prueba el reintento (`[S1 resp. 31]`). `onUnhandledFrame: 'error'` rechaza cualquier otra ruta.
 */
export function crearBffAnalisisSimulado() {
  const servidor = setupServer();
  const cuerpos: unknown[] = [];
  return {
    cuerpos,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      cuerpos.length = 0;
    },
    responder: (...respuestas: Respuesta[]) => {
      let siguiente = 0;
      servidor.use(
        http.post('*/api/evidence-analyses', async ({ request }) => {
          cuerpos.push(await request.json());
          const { status, cuerpo } = respuestas[Math.min(siguiente++, respuestas.length - 1)]!;
          return HttpResponse.json(cuerpo, { status });
        }),
      );
    },
  };
}
