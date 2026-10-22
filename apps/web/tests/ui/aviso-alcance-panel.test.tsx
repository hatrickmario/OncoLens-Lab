// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearBffAnalisisSimulado, tipoNoHabilitado } from '../support/msw/evidence-analyses';
import { analizar, evidence, SIN_BASE } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

const AVISO = 'Tipo de cáncer fuera del alcance del piloto: sin análisis con IA';

describe('EvidencePanel · aviso de alcance (tipo_no_habilitado)', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra el aviso de alcance informativo, sin estilo de error, ante tipo_no_habilitado [US-043 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: tipoNoHabilitado });
    await analizar();

    const aviso = await screen.findByText(AVISO);
    expect(aviso.closest('[role="alert"]')).toBeNull();
    expect(aviso.closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByText(evidence.error.generico)).toBeNull();
    for (const nota of screen.getAllByRole('note')) {
      expect(nota.textContent).toBe(tipoNoHabilitado.disclaimer);
    }
  });

  it('muestra la Base del análisis diciendo que no se consultó el corpus ante tipo_no_habilitado [US-043 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: tipoNoHabilitado });
    await analizar();

    await screen.findByText(AVISO);
    expect(screen.getByRole('heading', { level: 3, name: 'Base del análisis' })).toBeTruthy();
    expect(screen.getByText('No se consultó el corpus: tipo fuera de alcance')).toBeTruthy();
  });

  it('no muestra opciones, puntaje ni anuncio de análisis listo ante tipo_no_habilitado [US-043 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: tipoNoHabilitado });
    await analizar();

    await screen.findByText(AVISO);
    expect(screen.queryByRole('heading', { name: evidence.resultado.encabezado })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: SIN_BASE })).toBeNull();
    expect(screen.queryByTestId('relevance-label')).toBeNull();
    expect(screen.queryByText(/Relevancia máxima/)).toBeNull();
    expect(screen.queryByText(/Análisis listo/)).toBeNull();
  });

  it('mantiene el formulario habilitado para seguir consultando cuando el tipo no está habilitado [US-043 AC-2] [RN-26]', async () => {
    bff.responder({ status: 200, cuerpo: tipoNoHabilitado });
    await analizar();
    await screen.findByText(AVISO);

    const boton = screen.getByRole('button', { name: evidence.formulario.analizar });
    expect((boton as HTMLButtonElement).disabled).toBe(false);
  });
});
