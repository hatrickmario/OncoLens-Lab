// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../../components/organisms/login-form';
import { mensajes } from '../../lib/mensajes';
import {
  credencialesInvalidas,
  crearBffLoginSimulado,
  cuerpoInvalido,
  loginRequest,
} from '../support/login-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const RUTA_DE_INICIO = '/pacientes/00000000-0000-4000-8000-000000000001/analisis';
const { login } = mensajes();
const bff = crearBffLoginSimulado();

async function enviarCredenciales() {
  const usuario = userEvent.setup();
  render(<LoginForm homePath={RUTA_DE_INICIO} textos={login} />);
  await usuario.type(screen.getByLabelText(login.correo), loginRequest.email);
  await usuario.type(screen.getByLabelText(login.contrasena), loginRequest.password);
  await usuario.click(screen.getByRole('button', { name: login.enviar }));
}

describe('LoginForm', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra Correo o contraseña incorrectos en role=alert y sigue en /login cuando el login responde 401 [US-211 AC-2]', async () => {
    bff.responder(401, credencialesInvalidas);

    await enviarCredenciales();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('Correo o contraseña incorrectos.');
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: login.enviar })).toHaveProperty('disabled', false);
  });

  it('deshabilita el botón con Entrando… y navega a la ruta de inicio configurada cuando el login responde 204 [US-211 AC-1]', async () => {
    let liberar!: () => void;
    bff.responder(204, undefined, new Promise<void>((resolver) => (liberar = resolver)));

    await enviarCredenciales();

    const enEspera = await screen.findByRole('button', { name: login.enviando });
    expect(enEspera).toHaveProperty('disabled', true);
    expect(replace).not.toHaveBeenCalled();
    liberar();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(RUTA_DE_INICIO));
    expect(bff.cuerpos).toEqual([loginRequest]);
  });

  it('muestra el mismo error genérico cuando el BFF responde 422 por cuerpo inválido', async () => {
    bff.responder(422, cuerpoInvalido);

    await enviarCredenciales();

    expect((await screen.findByRole('alert')).textContent).toBe(login.errorCredenciales);
    expect(replace).not.toHaveBeenCalled();
  });

  it('no envía nada y muestra el error genérico cuando el correo no tiene forma de correo', async () => {
    const usuario = userEvent.setup();
    render(<LoginForm homePath={RUTA_DE_INICIO} textos={login} />);
    await usuario.type(screen.getByLabelText(login.correo), 'sin-arroba');
    await usuario.type(screen.getByLabelText(login.contrasena), loginRequest.password);
    await usuario.click(screen.getByRole('button', { name: login.enviar }));

    expect((await screen.findByRole('alert')).textContent).toBe(login.errorCredenciales);
    expect(bff.cuerpos).toEqual([]);
  });

  it('declara los autocomplete username y current-password en sus campos', () => {
    render(<LoginForm homePath={RUTA_DE_INICIO} textos={login} />);

    expect(screen.getByLabelText(login.correo).getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText(login.contrasena).getAttribute('autocomplete')).toBe(
      'current-password',
    );
  });
});
