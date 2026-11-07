// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidenciaSoloDescartadas,
  crearBffAnalisisSimulado,
  sinEvidencia,
} from '../support/msw/evidence-analyses';
import { analizar, evidence, SIN_BASE } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

function esperarSinResultadoParcial() {
  expect(screen.queryByRole('note')).toBeNull();
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  expect(screen.queryByRole('heading', { level: 3, name: SIN_BASE })).toBeNull();
  expect(screen.queryByTestId('relevance-label')).toBeNull();
  expect(screen.queryByText(evidence.discarded.titulo)).toBeNull();
}

describe('EvidencePanel · estados mínimos del S1', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra Relevancia máxima: no aplica y nunca 0 cuando el análisis es sin_evidencia [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02]', async () => {
    bff.responder({ status: 200, cuerpo: sinEvidencia });
    await analizar();

    expect(await screen.findByText(evidence.resultado.sinEvidencia)).toBeTruthy();
    expect(screen.getByText('Relevancia máxima: no aplica')).toBeTruthy();
    expect(screen.queryByText(/\b0,00\b|Relevancia máxima: 0/)).toBeNull();
    expect(screen.queryByRole('heading', { name: evidence.resultado.encabezado })).toBeNull();
    for (const aviso of screen.getAllByRole('note')) {
      expect(aviso.textContent).toBe(sinEvidencia.disclaimer);
    }
  });

  it('muestra el aviso y la frase sin opciones con soporte cuando solo hay descartadas [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02] [RN-06]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaSoloDescartadas });
    await analizar();

    expect(await screen.findByText(evidence.resultado.soloDescartadas)).toBeTruthy();
    for (const aviso of screen.getAllByRole('note')) {
      expect(aviso.textContent).toBe(conEvidenciaSoloDescartadas.disclaimer);
    }
    expect(screen.queryByRole('heading', { level: 3, name: SIN_BASE })).toBeNull();
  });

  it('redirige a /login?motivo=expirada sin renderizar datos cuando la petición responde 401 [US-044 AC-4]', async () => {
    bff.responder({
      status: 401,
      cuerpo: { error: 'NO_AUTENTICADO', message: 'x', traceId: 'req_1' },
    });
    await analizar();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?motivo=expirada'));
    esperarSinResultadoParcial();
  });
});
