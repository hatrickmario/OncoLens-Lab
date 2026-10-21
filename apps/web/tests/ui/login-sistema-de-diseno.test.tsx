// @vitest-environment jsdom
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../app/login/page';
import { LoginForm } from '../../components/organisms/login-form';
import { mensajes } from '../../lib/mensajes';
import { credencialesInvalidas, crearBffLoginSimulado, loginRequest } from '../support/login-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const { login } = mensajes();
const bff = crearBffLoginSimulado();
const aRuta = (relativa: string) => resolve(import.meta.dirname, '../..', relativa);

describe('Login con el sistema de diseño', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    vi.unstubAllEnvs();
  });

  it('muestra Correo o contraseña incorrectos en un Alert con role=alert cuando el login responde 401 [ARR-02 AC-3]', async () => {
    bff.responder(401, credencialesInvalidas);
    const usuario = userEvent.setup();
    render(<LoginForm homePath="/inicio" textos={login} />);
    await usuario.type(screen.getByLabelText(login.correo), loginRequest.email);
    await usuario.type(screen.getByLabelText(login.contrasena), loginRequest.password);
    await usuario.click(screen.getByRole('button', { name: login.enviar }));

    const alerta = await screen.findByRole('alert');
    expect(alerta.getAttribute('data-slot')).toBe('alert');
    expect(alerta.textContent).toBe('Correo o contraseña incorrectos.');
  });

  it('no contiene archivos .module.css en app/login ni en los componentes del login [ARR-02 AC-3]', () => {
    const modulosCss = readdirSync(aRuta('app/login/'), { recursive: true }).filter((archivo) =>
      String(archivo).endsWith('.module.css'),
    );

    expect(modulosCss).toEqual([]);
    expect(existsSync(aRuta('components/organisms/login-form.module.css'))).toBe(false);
    expect(existsSync(aRuta('components/molecules/campo-con-etiqueta.module.css'))).toBe(false);
  });

  it('monta la tarjeta del login con el componente Card del sistema de diseño [ARR-02 AC-3]', async () => {
    vi.stubEnv('CLINICAL_API_URL', 'http://clinical-api.test:3000');
    vi.stubEnv('WEB_ALLOWED_ORIGIN', 'http://127.0.0.1:3000');
    vi.stubEnv('WEB_UPSTREAM_TIMEOUT_MS', '5000');
    vi.stubEnv('WEB_HOME_PATH', '/pacientes/x/analisis');

    render(await LoginPage());

    const tarjeta = screen.getByRole('region', { name: login.titulo });
    expect(tarjeta.getAttribute('data-slot')).toBe('card');
  });
});
