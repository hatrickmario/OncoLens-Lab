// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../app/login/page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

async function abrirLogin(motivo: string | string[] | undefined) {
  vi.stubEnv('CLINICAL_API_URL', 'http://clinical-api.test:3000');
  vi.stubEnv('WEB_ALLOWED_ORIGIN', 'http://127.0.0.1:3000');
  vi.stubEnv('WEB_UPSTREAM_TIMEOUT_MS', '5000');
  vi.stubEnv('WEB_HOME_PATH', '/pacientes/x/analisis');
  render(await LoginPage({ searchParams: Promise.resolve(motivo ? { motivo } : {}) }));
}

describe('AvisoDeSesion en /login', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('muestra Tu sesión expiró en role=status cuando /login llega con motivo=expirada [US-044 AC-4]', async () => {
    await abrirLogin('expirada');

    expect(screen.getByRole('status').textContent).toBe(
      'Tu sesión expiró. Vuelve a iniciar sesión.',
    );
  });

  it('muestra Cerraste sesión en role=status cuando /login llega con motivo=cerrada [US-044 AC-1]', async () => {
    await abrirLogin('cerrada');

    expect(screen.getByRole('status').textContent).toBe('Cerraste sesión.');
  });

  it.each(['<script>', '/pacientes/123', ['expirada', 'cerrada'], undefined])(
    'no muestra ningún aviso de sesión ni pinta el valor cuando motivo es %j [US-044 AC-4]',
    async (motivo) => {
      await abrirLogin(motivo);

      expect(screen.queryByRole('status')).toBeNull();
      expect(document.body.textContent).not.toContain('/pacientes/123');
      expect(document.body.textContent).not.toContain('<script>');
    },
  );
});
