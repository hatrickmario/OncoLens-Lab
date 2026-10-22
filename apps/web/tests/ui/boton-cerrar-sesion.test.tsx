// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import errorInterno from '../../../../contracts/examples/error-interno.json';
import noAutenticado from '../../../../contracts/examples/error-no-autenticado.json';
import { AppHeader } from '../../components/organisms/app-header';
import { mensajes } from '../../lib/mensajes';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const { app } = mensajes();
const servidor = setupServer();
const metodos: string[] = [];

function responderLogout(status: number, cuerpo?: object) {
  servidor.use(
    http.post('*/api/auth/logout', ({ request }) => {
      metodos.push(request.method);
      return cuerpo === undefined
        ? new HttpResponse(null, { status })
        : HttpResponse.json(cuerpo, { status });
    }),
  );
}

async function presionarCerrarSesion() {
  const usuario = userEvent.setup();
  render(<AppHeader />);
  await usuario.click(screen.getByRole('button', { name: app.cerrarSesion }));
}

describe('BotonCerrarSesion en AppHeader', () => {
  beforeAll(() => servidor.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => servidor.close());
  afterEach(() => {
    cleanup();
    servidor.resetHandlers();
    metodos.length = 0;
    replace.mockReset();
  });

  it('envía POST /api/auth/logout y lleva a /login?motivo=cerrada cuando el BFF responde 204 [US-044 AC-1]', async () => {
    responderLogout(204);

    await presionarCerrarSesion();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?motivo=cerrada'));
    expect(metodos).toEqual(['POST']);
  });

  it('lleva a /login?motivo=expirada cuando el BFF responde 401 porque la sesión ya no existe [US-044 AC-4]', async () => {
    responderLogout(401, noAutenticado);

    await presionarCerrarSesion();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?motivo=expirada'));
  });

  it('avisa en role=alert y no sale de la página cuando el cierre falla con 502 [US-044 AC-1]', async () => {
    responderLogout(502, errorInterno);

    await presionarCerrarSesion();

    expect((await screen.findByRole('alert')).textContent).toBe(app.errorCerrarSesion);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: app.cerrarSesion })).toHaveProperty(
      'disabled',
      false,
    );
  });
});
