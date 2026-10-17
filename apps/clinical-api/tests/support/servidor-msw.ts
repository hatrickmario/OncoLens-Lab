import type { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';

const esLoopback = (url: string) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);

/**
 * MSW en el borde saliente (rag-orchestrator, MinIO...). Supertest llama a la propia aplicación por loopback: esa
 * petición pasa; cualquier otra sin handler falla el test.
 */
export function servidorMswConLoopback(...handlers: RequestHandler[]) {
  const servidor = setupServer(...handlers);
  return {
    servidor,
    iniciar: () =>
      servidor.listen({
        onUnhandledFrame: ({ frame, defaults }) => {
          if (
            frame.protocol === 'http' &&
            esLoopback((frame.data as { request: Request }).request.url)
          )
            frame.passthrough();
          else defaults.error();
        },
      }),
    detener: () => servidor.close(),
  };
}
