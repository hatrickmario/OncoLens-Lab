// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { CitationDetails } from '../../components/molecules/citation-details';
import { conEvidencia, crearBffAnalisisSimulado } from '../support/msw/evidence-analyses';
import { analizar, evidence } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const opcion = conEvidencia.evidenceOptions[0]!;
const citaDelEjemplo = opcion.citedSources[0]! as CitedSource;

const HTML_IMG = '<img src=x onerror=alert(1)>';
const HTML_SCRIPT = '<script>window.__xss=1</script>';

function conCita(campos: Partial<CitedSource>, opcionExtra: object = {}) {
  const cita: CitedSource = { ...citaDelEjemplo, ...campos };
  return { ...conEvidencia, evidenceOptions: [{ ...opcion, ...opcionExtra, citedSources: [cita] }] };
}

async function mostrar(cuerpo: object) {
  bff.responder({ status: 200, cuerpo });
  const usuario = await analizar();
  const chip = await screen.findByRole('button', { name: new RegExp(citaDelEjemplo.externalId) });
  await usuario.click(chip);
  return usuario;
}

describe('Texto generado o del corpus con HTML en el panel', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra literal la justificación y el fragmento citado, sin crear img ni script, cuando traen HTML malicioso [US-216 AC-3]', async () => {
    const texto = `${HTML_IMG} ${HTML_SCRIPT}`;
    const usuario = await mostrar(
      conCita({ chunkTextSnapshot: texto }, { rationale: texto }),
    );
    await usuario.click(screen.getByRole('button', { name: evidence.cita.verFragmento }));

    expect(screen.getAllByText(texto, { exact: false }).length).toBeGreaterThanOrEqual(2);
    expect(document.body.querySelector('img, script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});

describe('Enlaces de cita', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  // El contrato (`sourceUrl` solo https) ya rechaza estos esquemas en el BFF; el componente es la segunda defensa.
  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>'])(
    'no crea un elemento a y muestra el título como texto cuando la url de la cita es %s [US-216 AC-5]',
    (url) => {
      render(
        <CitationDetails cita={{ ...citaDelEjemplo, sourceUrl: url }} id="cita-x" onVerFragmento={() => {}} />,
      );

      expect(document.body.querySelector('a')).toBeNull();
      expect(screen.getByText(citaDelEjemplo.title)).toBeTruthy();
    },
  );

  it('abre la url https en otra pestaña con noopener noreferrer [US-216 AC-5]', async () => {
    const url = 'https://example.org/estudio';
    await mostrar(conCita({ sourceUrl: url }));

    const enlace = screen.getByRole('link', { name: url });
    expect(enlace.getAttribute('href')).toBe(url);
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
