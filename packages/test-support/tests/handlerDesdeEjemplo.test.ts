import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { handlerDesdeEjemplo } from '../msw/index.js';

// US-213 AC-10 (test después, ADR-26): los handlers de MSW salen de contracts/examples/ y no pueden declarar campos ajenos.
const URL_RAG = 'http://rag-orchestrator.test/rag/query';
const EJEMPLO = 'rag-query-con-evidencia.json';

const servidor = setupServer();
beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

async function consultar(): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const respuesta = await fetch(URL_RAG, { method: 'POST', body: '{}' });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as Record<string, unknown> };
}

describe('handlerDesdeEjemplo', () => {
  it('responde con el cuerpo del ejemplo del contrato cuando no se sobrescribe nada', async () => {
    servidor.use(handlerDesdeEjemplo({ metodo: 'post', url: URL_RAG }, EJEMPLO));

    const { status, cuerpo } = await consultar();

    expect(status).toBe(200);
    expect(cuerpo.status).toBe('con_evidencia');
  });

  it('aplica el valor sobrescrito y conserva el resto del ejemplo cuando la clave existe en él', async () => {
    servidor.use(
      handlerDesdeEjemplo({ metodo: 'post', url: URL_RAG }, EJEMPLO, {
        sobrescribir: { status: 'sin_evidencia' },
        status: 200,
      }),
    );

    const { cuerpo } = await consultar();

    expect(cuerpo.status).toBe('sin_evidencia');
    expect(cuerpo).toHaveProperty('synthesis');
  });

  it('falla nombrando el campo y el ejemplo cuando sobrescribir añade una clave ausente en el ejemplo [US-213 AC-10] [ADR-26]', () => {
    expect(() =>
      handlerDesdeEjemplo({ metodo: 'post', url: URL_RAG }, EJEMPLO, {
        sobrescribir: { campoInventado: 1 },
      }),
    ).toThrowError(`el campo "campoInventado" no existe en el ejemplo ${EJEMPLO}`);
  });

  it('falla nombrando la ruta completa cuando la clave ajena está anidada', () => {
    expect(() =>
      handlerDesdeEjemplo({ metodo: 'post', url: URL_RAG }, EJEMPLO, {
        sobrescribir: { synthesis: { inventado: [] } },
      }),
    ).toThrowError(`el campo "synthesis.inventado" no existe en el ejemplo ${EJEMPLO}`);
  });

  it('falla nombrando el ejemplo cuando el archivo no existe en contracts/examples/', () => {
    expect(() =>
      handlerDesdeEjemplo({ metodo: 'post', url: URL_RAG }, 'no-existe.json'),
    ).toThrowError('no-existe.json');
  });

  it('entrega la petición recibida a alRecibir sin alterar la respuesta', async () => {
    const recibidas: string[] = [];
    servidor.use(
      handlerDesdeEjemplo({ metodo: 'post', url: URL_RAG }, EJEMPLO, {
        alRecibir: async (peticion) => {
          recibidas.push(await peticion.text());
        },
      }),
    );

    const { status } = await consultar();

    expect(status).toBe(200);
    expect(recibidas).toEqual(['{}']);
  });
});
