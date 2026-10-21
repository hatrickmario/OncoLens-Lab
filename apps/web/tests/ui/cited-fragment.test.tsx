// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { CitedFragment } from '../../components/molecules/cited-fragment';
import { conEvidencia } from '../support/msw/evidence-analyses';
import { evidence } from '../support/panel-ui';

const cita = conEvidencia.evidenceOptions[0]!.citedSources[0]! as CitedSource;

describe('CitedFragment', () => {
  afterEach(cleanup);

  it.each(['javascript:alert(1)', 'http://inseguro.example/doc', 'ftp://servidor.test/doc'])(
    'no enlaza la fuente y muestra No disponible cuando la URL no es https segura (%s) [ARR-07 AC-4]',
    (sourceUrl) => {
      render(<CitedFragment cita={{ ...cita, sourceUrl }} onVolver={() => undefined} />);

      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText(evidence.cita.fuenteOriginal).nextElementSibling?.textContent).toBe(
        evidence.cita.noDisponible,
      );
    },
  );
});
