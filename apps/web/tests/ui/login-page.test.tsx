// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../app/login/page';
import { mensajes } from '../../lib/mensajes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const { app, login } = mensajes();

describe('LoginPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('muestra la etiqueta de uso académico desde la clave app.academicUseLabel cuando se renderiza /login sin sesión [US-069 AC-3]', async () => {
    vi.stubEnv('WEB_HOME_PATH', '/pacientes/x/analisis');

    render(await LoginPage());

    expect(app.academicUseLabel).toBe(['Uso académico', 'investigación'].join('/'));
    expect(screen.getByText(app.academicUseLabel)).toBeTruthy();
  });

  it('muestra marca, título y subtítulo de S1-01 leídos de es.json', async () => {
    vi.stubEnv('WEB_HOME_PATH', '/pacientes/x/analisis');

    render(await LoginPage());

    expect(screen.getByText(app.nombre)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: login.titulo })).toBeTruthy();
    expect(screen.getByText(login.subtitulo)).toBeTruthy();
    expect(screen.getByLabelText(login.correo)).toBeTruthy();
  });

  it.each(['//evil.example/x', 'https://evil.example', 'pacientes/x'])(
    'falla al arrancar cuando WEB_HOME_PATH no es una ruta interna (%s)',
    async (valor) => {
      vi.stubEnv('WEB_HOME_PATH', valor);

      await expect(LoginPage()).rejects.toThrow('WEB_HOME_PATH');
    },
  );
});
