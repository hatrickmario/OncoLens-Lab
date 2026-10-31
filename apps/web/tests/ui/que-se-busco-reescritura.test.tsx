// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import conReescritura from '../../../../contracts/examples/con-evidencia-reescritura.json';
import { conEvidencia, crearBffAnalisisSimulado } from '../support/msw/evidence-analyses';
import { analizar } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

/** Texto normativo de D8 (design.md de l1d-300): la reformulación misma nunca llega a la UI, solo el booleano. */
const TEXTO_DE_LA_REESCRITURA =
  'La búsqueda se repitió con una reformulación de la pregunta con términos del catálogo; la relevancia se calculó contra la pregunta original';

describe('Base del análisis: reescritura de la consulta (US-238, D8)', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra bajo «Qué se buscó», sin expandir, que la búsqueda se repitió con una reformulación cuando queryRewritten es true [US-238 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: conReescritura });
    await analizar();

    const seccion = await screen.findByRole('region', { name: 'Qué se buscó' });
    expect(seccion.textContent).toContain(TEXTO_DE_LA_REESCRITURA);
    expect(screen.queryByRole('button', { name: 'Ocultar detalle' })).toBeNull();
  });

  it('no muestra el aviso de reformulación cuando queryRewritten es false [US-238 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();

    await screen.findByRole('heading', { level: 3, name: 'Base del análisis' });
    expect(document.body.textContent).not.toContain('se repitió con una reformulación');
    expect(screen.queryByRole('region', { name: 'Qué se buscó' })).toBeNull();
  });
});
