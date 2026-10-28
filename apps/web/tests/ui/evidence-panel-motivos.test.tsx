// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidencia,
  crearBffAnalisisSimulado,
  soloDescartadasCitaInvalida,
  soloDescartadasMotivosMixtos,
  soloDescartadasOtrosMotivos,
} from '../support/msw/evidence-analyses';
import { analizar, evidence } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const PROHIBIDOS = /recomendad|recomendaci[oó]n|debe recibir|tratamiento indicado/i;

async function lineasDeMotivos(cuerpo: object) {
  bff.responder({ status: 200, cuerpo });
  await analizar();
  await screen.findByText(evidence.resultado.soloDescartadas);
  const region = screen.getByText(evidence.discarded.motivos).parentElement!;
  return within(region)
    .queryAllByRole('listitem')
    .map((li) => li.textContent);
}

describe('EvidencePanel · motivos del estado solo descartadas', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra una vez el motivo de cita inválida bajo el titular, sin recuento ni chunkId, cuando todas las descartadas son cita_invalida [US-237 AC-1]', async () => {
    const lineas = await lineasDeMotivos(soloDescartadasCitaInvalida);
    expect(lineas).toEqual([evidence.discardReason.cita_invalida]);
    expect(document.body.textContent).not.toMatch(/\d\s*×/);
    expect(document.body.textContent).not.toMatch(/chunk/i);
  });

  it('muestra 2 × cita inválida y luego 1 × sin citas en el orden del contrato cuando los motivos son mixtos [US-237 AC-2]', async () => {
    const lineas = await lineasDeMotivos(soloDescartadasMotivosMixtos);
    expect(lineas).toEqual([
      `2 × ${evidence.discardReason.cita_invalida}`,
      `1 × ${evidence.discardReason.sin_citas}`,
    ]);
  });

  it('usa las etiquetas existentes de discardReason sin claves nuevas por motivo cuando los motivos son afirmación sin soporte y análisis previo [US-237 AC-3]', async () => {
    const lineas = await lineasDeMotivos(soloDescartadasOtrosMotivos);
    expect(lineas).toEqual([
      `1 × ${evidence.discardReason.afirmacion_sin_soporte}`,
      `1 × ${evidence.discardReason.solo_soportada_por_analisis_previo}`,
    ]);
  });

  it('no contiene términos prohibidos y mantiene visible el aviso de IA en el estado solo descartadas con motivos [US-237 AC-4]', async () => {
    await lineasDeMotivos(soloDescartadasMotivosMixtos);
    expect(screen.getByText(evidence.discarded.motivos)).toBeTruthy();
    expect(screen.getByTestId('analysis-result').textContent).not.toMatch(PROHIBIDOS);
    const avisos = screen.getAllByRole('note');
    expect(avisos.length).toBeGreaterThan(0);
    for (const aviso of avisos)
      expect(aviso.textContent).toBe(soloDescartadasMotivosMixtos.disclaimer);
  });

  it('no muestra Motivos cuando hay una opción aceptada', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();
    await screen.findByRole('heading', { name: evidence.resultado.encabezado });
    expect(screen.queryByText(evidence.discarded.motivos)).toBeNull();
  });
});
