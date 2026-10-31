// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApplicabilityCriterion } from '../../../../packages/api-contracts/src/types/clinical-api';
import { ApplicabilityCounts } from '../../components/molecules/applicability-counts';
import { CriterionStatus } from '../../components/molecules/criterion-status';

const ID = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';
const RESUMEN = { coincide: 1, parcial: 1, noCoincide: 1, desconocido: 1 };
const ESTADOS = ['coincide', 'parcial', 'no_coincide', 'desconocido'] as const;

function criterio(status: ApplicabilityCriterion['status']): ApplicabilityCriterion {
  return {
    criterion: 'ecog',
    patientValue: null,
    studyPopulationValue: null,
    status,
    unknownReason: null,
    isExclusionary: false,
    patientDataWarning: null,
    citedSources: [],
  };
}

describe('Estados de aplicabilidad', () => {
  afterEach(cleanup);

  it.each(ESTADOS.map((estado, indice) => [estado, indice] as const))(
    'usa el mismo símbolo y la misma palabra en la fila que en la línea de conteos cuando el estado es %s',
    (estado, indice) => {
      const conteos = render(<ApplicabilityCounts resumen={RESUMEN} />);
      const delConteo = conteos.container.querySelectorAll('[role="group"] > span')[indice]!;
      const simboloDelConteo = delConteo.querySelector('[aria-hidden="true"]')!.textContent;
      const palabraDelConteo = delConteo
        .textContent!.replace(simboloDelConteo!, '')
        .replace(/\s*1$/, '');
      cleanup();

      const fila = render(
        <CriterionStatus criterio={criterio(estado)} motivo={null} patientId={ID} />,
      );
      const simbolo = fila.container.querySelector('[aria-hidden="true"]')!.textContent;

      expect(simbolo?.trim()).toBe(simboloDelConteo?.trim());
      expect(screen.getByText(palabraDelConteo.trim())).toBeTruthy();
    },
  );
});
