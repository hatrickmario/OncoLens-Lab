import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import credencialesInvalidas from '../../../../contracts/examples/error-credenciales-invalidas.json';
import cuerpoInvalido from '../../../../contracts/examples/error-cuerpo-invalido.json';
import loginRequest from '../../../../contracts/examples/login-request.json';

export { credencialesInvalidas, cuerpoInvalido, loginRequest };

/** `POST /api/auth/login` del BFF simulado en el borde HTTP (MSW), con los ejemplos del contrato. */
export function crearBffLoginSimulado() {
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
    /** Fallo de red: el `fetch` del navegador rechaza sin respuesta. */
    fallarRed: () => servidor.use(http.post('*/api/auth/login', () => HttpResponse.error())),
    /** `espera` retiene la respuesta para observar el estado "Entrando…". */
    responder: (status: number, cuerpo?: object, espera?: Promise<void>) =>
      servidor.use(
        http.post('*/api/auth/login', async ({ request }) => {
          cuerpos.push(await request.json());
          await espera;
          return status === 204 || cuerpo === undefined
            ? new HttpResponse(null, { status })
            : HttpResponse.json(cuerpo, { status });
        }),
      ),
  };
}
