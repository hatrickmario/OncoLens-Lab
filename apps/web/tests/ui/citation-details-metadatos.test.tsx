// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { conEvidencia, crearBffAnalisisSimulado } from '../support/msw/evidence-analyses';
import { analizar } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const opcion = conEvidencia.evidenceOptions[0]!;
const citaDelEjemplo = opcion.citedSources[0]! as CitedSource;

/** Respuesta del ejemplo del contrato con la cita ajustada a valores válidos del tipo generado. */
function conCita(campos: Partial<CitedSource>) {
  const cita: CitedSource = { ...citaDelEjemplo, ...campos };
  return { ...conEvidencia, evidenceOptions: [{ ...opcion, citedSources: [cita] }] };
}

async function expandirCita(cuerpo: object) {
  bff.responder({ status: 200, cuerpo });
  const usuario = await analizar();
  await usuario.click(
    await screen.findByRole('button', { name: new RegExp(citaDelEjemplo.externalId) }),
  );
}

function valorDe(rotulo: string) {
  return screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling as HTMLElement;
}

describe('CitationDetails · metadatos factuales de la fuente', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra No disponible en Endpoint principal y Tamaño de muestra, sin data-origen, cuando la cita los trae en null [US-127 AC-3]', async () => {
    expect(citaDelEjemplo.primaryEndpoint).toBeNull();
    expect(citaDelEjemplo.sampleSize).toBeNull();

    await expandirCita(conEvidencia);

    for (const rotulo of ['Endpoint principal', 'Tamaño de muestra']) {
      const valor = valorDe(rotulo);
      expect(valor.textContent).toBe('No disponible');
      expect(valor.closest('[data-origen]')).toBeNull();
    }
  });

  it('muestra fase, endpoint, tamaño y versión con el valor del contrato, como texto, cuando la cita los trae [US-127 AC-1]', async () => {
    await expandirCita(
      conCita({
        trialPhase: 'III',
        primaryEndpoint: 'Supervivencia global <b>a 5 años</b>',
        sampleSize: 1234,
        guidelineVersion: '2026-05',
      }),
    );

    expect(valorDe('Fase del ensayo').textContent).toBe('III');
    expect(valorDe('Endpoint principal').textContent).toBe('Supervivencia global <b>a 5 años</b>');
    expect(valorDe('Endpoint principal').querySelector('b')).toBeNull();
    expect(valorDe('Tamaño de muestra').textContent).toBe('1234');
    expect(valorDe('Versión de la guía').textContent).toBe('2026-05');
  });

  it('muestra 0 y no No disponible cuando sampleSize es 0', async () => {
    await expandirCita(conCita({ sampleSize: 0 }));

    expect(valorDe('Tamaño de muestra').textContent).toBe('0');
  });

  it.each([
    ['guia', 'Guía clínica'],
    ['eca', 'Ensayo clínico aleatorizado'],
    ['observacional', 'Estudio observacional'],
    ['revision_sistematica', 'Revisión sistemática'],
    ['otro', 'Otro diseño'],
  ])('muestra el rótulo legible de %s en Diseño del estudio', async (codigo, rotulo) => {
    await expandirCita(conCita({ studyDesign: codigo }));

    expect(valorDe('Diseño del estudio').textContent).toBe(rotulo);
  });

  it.each([null, 'diseno_inventado'])(
    'muestra No disponible en Diseño del estudio cuando el código es %s',
    async (codigo) => {
      await expandirCita(conCita({ studyDesign: codigo }));

      expect(valorDe('Diseño del estudio').textContent).toBe('No disponible');
    },
  );
});
