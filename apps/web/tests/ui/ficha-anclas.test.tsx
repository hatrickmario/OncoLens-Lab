// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FichaDelDoctor } from '../../components/organisms/ficha-del-doctor';
import type { PatientSummary } from '../../../../packages/api-contracts/src/types/clinical-api';
import { anclaPermitida } from '../../lib/ficha/anclas';
import { fichaDelDoctor } from '../support/ficha-simulado';

function abrirFichaCon(fragmento: string) {
  window.history.replaceState(null, '', `/pacientes/${fichaDelDoctor.id}${fragmento}`);
  render(<FichaDelDoctor ficha={fichaDelDoctor as PatientSummary} />);
}

describe('Anclas de la ficha', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it.each([
    ['#biomarcadores', 'Biomarcadores recientes'],
    ['#diagnostico', 'Diagnóstico vigente'],
  ])(
    'da el foco al encabezado de la sección con tabindex -1 cuando se llega con %s [US-005 AC-3] [US-005 AC-7]',
    (fragmento, titulo) => {
      abrirFichaCon(fragmento);

      const encabezado = screen.getByRole('heading', { level: 2, name: titulo });
      expect(encabezado.id).toBe(fragmento.slice(1));
      expect(encabezado.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(encabezado);
    },
  );

  it('ignora un fragmento fuera de la lista permitida sin lanzar, sin querySelector y sin mover el foco [US-005 AC-3]', () => {
    const querySelector = vi.spyOn(document, 'querySelector');

    expect(() => abrirFichaCon('#x"],img')).not.toThrow();

    expect(querySelector).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('da el foco al cambiar el fragmento sin recargar la ficha [US-005 AC-3]', () => {
    abrirFichaCon('');
    const encabezado = screen.getByRole('heading', { level: 2, name: 'Biomarcadores recientes' });

    act(() => {
      window.history.replaceState(null, '', `/pacientes/${fichaDelDoctor.id}#biomarcadores`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(document.activeElement).toBe(encabezado);
  });

  it('no crea secciones nuevas: las secciones de la ficha son las mismas [US-005 AC-3]', () => {
    abrirFichaCon('#diagnostico');

    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))).toEqual([
      'ficha-identificacion',
      'diagnostico',
      'biomarcadores',
    ]);
  });
});

describe('anclaPermitida', () => {
  it('acepta el nombre con o sin # y rechaza cualquier otro valor', () => {
    expect(anclaPermitida('#diagnostico')).toBe('diagnostico');
    expect(anclaPermitida('biomarcadores')).toBe('biomarcadores');
    expect(anclaPermitida('')).toBeNull();
    expect(anclaPermitida('#Diagnostico')).toBeNull();
    expect(anclaPermitida('#ficha-identificacion')).toBeNull();
    expect(anclaPermitida('#x"],img')).toBeNull();
  });
});
