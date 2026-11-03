// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import casoPCaso from '../../../../contracts/examples/case-view-p-caso.json';
import { ProcedenciaDelEvento } from '../../components/molecules/procedencia-del-evento';
import { rotuloDeEvento, type EventoDelCaso } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';

const base = casoPCaso.timeline[0] as EventoDelCaso;

function evento(eventType: string, entryMethod: string, reviewStatus: string): EventoDelCaso {
  return {
    ...base,
    eventType,
    provenance: {
      ...base.provenance,
      entryMethod: entryMethod as EventoDelCaso['provenance']['entryMethod'],
      extractionConfidence: 'n_a',
      reviewStatus: reviewStatus as EventoDelCaso['provenance']['reviewStatus'],
    },
  };
}

describe('ProcedenciaDelEvento', () => {
  afterEach(cleanup);

  it.each([
    ['analisis_ia', 'manual', 'auto_aceptado'],
    ['resumen_caso', 'manual', 'verificado'],
    ['analisis_ia', 'seed', 'n_a'],
  ])(
    'muestra Generado por IA · Sin verificar y nunca Registro manual cuando el evento %s llega con %s y %s [RN-24]',
    (tipo, metodo, revision) => {
      const { container } = render(
        <ProcedenciaDelEvento evento={evento(tipo, metodo, revision)} />,
      );

      expect(container.textContent).toContain(mensajes().caso.origenIa);
      expect(container.textContent).not.toContain('Registro manual');
      expect(container.textContent).not.toContain('Confianza de extracción');
    },
  );

  it('muestra origen, revisión y confianza cuando el evento no es de IA', () => {
    const { container } = render(
      <ProcedenciaDelEvento evento={evento('examen', 'manual', 'verificado')} />,
    );

    expect(container.textContent).toContain('Registro manual · Verificado');
  });

  it('tiene rótulo propio para cada eventType del ejemplo P-CASO (sin caer en Evento clínico) [riesgo del design]', () => {
    const tipos = [...new Set(casoPCaso.timeline.map((e) => e.eventType))];

    for (const tipo of tipos) {
      expect(rotuloDeEvento(tipo), tipo).not.toBe(mensajes().caso.tipoDesconocido);
    }
  });
});
