// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidencia,
  crearBffAnalisisSimulado,
  sinEvidencia,
  tipoNoHabilitado,
} from '../support/msw/evidence-analyses';
import { analizar, evidence } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

const AVISO = 'Tipo de cáncer fuera del alcance del piloto: sin análisis con IA';

async function esperarFalloDeTransporte() {
  expect(await screen.findByText(evidence.error.generico)).toBeTruthy();
  expect(screen.queryByText(AVISO)).toBeNull();
  expect(screen.queryByRole('heading', { level: 3, name: 'Base del análisis' })).toBeNull();
}

describe('EvidencePanel · respuesta incoherente con el contrato', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('trata como fallo de transporte un tipo_no_habilitado con opciones [US-043 AC-2]', async () => {
    bff.responder({
      status: 200,
      cuerpo: { ...tipoNoHabilitado, evidenceOptions: conEvidencia.evidenceOptions },
    });
    await analizar();
    await esperarFalloDeTransporte();
  });

  it('trata como fallo de transporte un tipo_no_habilitado con topRelevanceScore numérico [US-043 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: { ...tipoNoHabilitado, topRelevanceScore: 0.5 } });
    await analizar();
    await esperarFalloDeTransporte();
  });

  it('trata como fallo de transporte un sin_evidencia con topRelevanceScore 0 [US-069 AC-4] [RN-02]', async () => {
    bff.responder({ status: 200, cuerpo: { ...sinEvidencia, topRelevanceScore: 0 } });
    await analizar();
    expect(await screen.findByText(evidence.error.generico)).toBeTruthy();
    expect(screen.queryByText(evidence.resultado.sinEvidencia)).toBeNull();
  });
});
