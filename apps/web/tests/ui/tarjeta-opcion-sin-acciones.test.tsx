// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import conEvidencia from '../../../../contracts/examples/con-evidencia-s4-tres-opciones.json';
import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { EvidenceOptionCard } from '../../components/organisms/evidence-option-card';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const analisis = conEvidencia as unknown as EvidenceAnalysis;
const ID_PACIENTE = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';
/** Verbos y objetos de una acción clínica o de escritura: la tarjeta describe evidencia, no la ejecuta (AC-T3.2, FR-10). */
const ACCION_CLINICA =
  /registr|\baplicar\b|\baplicarla\b|prescrib|adopt|tratamiento|modific|\bedit|guardar|confirmar|eliminar/i;
/** Un destino de lectura: ancla, ficha del paciente o la URL pública de la fuente citada; nunca una ruta de escritura. */
const DESTINO_DE_LECTURA = /^(#|https:\/\/|\/pacientes\/[0-9a-f-]+(\/caso)?(#.*)?$)/;

function renderizarTarjeta(indice: number) {
  const opcion = analisis.evidenceOptions[indice]!;
  return render(
    <EvidenceOptionCard
      opcion={opcion}
      indice={indice}
      posicion={`Opción descrita ${indice + 1} de ${analisis.evidenceOptions.length}`}
      fuentes={analisis.applicability}
      patientId={ID_PACIENTE}
      onVerFragmento={vi.fn()}
    />,
  );
}

function controlesDe(contenedor: HTMLElement) {
  return [...contenedor.querySelectorAll<HTMLElement>('button, a, summary, [role="button"]')];
}

const nombreDe = (control: HTMLElement): string =>
  (control.getAttribute('aria-label') ?? control.textContent ?? '').trim();

describe('Tarjeta de opción descrita', () => {
  afterEach(cleanup);

  it.each(analisis.evidenceOptions.map((_, indice) => indice))(
    'no ofrece ningún control que registre un tratamiento, aplique la opción o modifique datos del paciente cuando se inspecciona la tarjeta %i [US-070 AC-3]',
    (indice) => {
      const { container } = renderizarTarjeta(indice);
      // Se despliegan las citas: sus detalles también son parte de la tarjeta.
      for (const chip of screen.getAllByRole('button', { expanded: false })) fireEvent.click(chip);

      const controles = controlesDe(container);

      expect(controles.length).toBeGreaterThan(0);
      for (const control of controles) {
        expect(nombreDe(control), `control «${nombreDe(control)}»`).not.toMatch(ACCION_CLINICA);
        if (control.tagName === 'A') {
          expect(control.getAttribute('href'), `enlace «${nombreDe(control)}»`).toMatch(
            DESTINO_DE_LECTURA,
          );
        }
        if (control.tagName === 'BUTTON') {
          expect(control.getAttribute('type'), `botón «${nombreDe(control)}»`).not.toBe('submit');
        }
      }
      expect(container.querySelector('form, input, textarea, select')).toBeNull();
    },
  );
});
