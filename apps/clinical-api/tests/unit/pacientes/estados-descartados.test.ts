import { describe, expect, it } from 'vitest';
import { registrosVigentes } from '../../../src/modules/completeness/completeness.rules.js';
import type { RegistroDeDato } from '../../../src/modules/completeness/ports.js';
import {
  ESTADOS_DESCARTADOS,
  sqlDatoVigente,
  type EstadoDeRevision,
} from '../../../src/modules/patients/estados-de-revision.js';

const TODOS_LOS_ESTADOS: readonly EstadoDeRevision[] = [
  'auto_aceptado',
  'requiere_revision',
  'verificado',
  'corregido',
  'rechazado',
  'reemplazado',
];

const registroConEstado = (reviewStatus: EstadoDeRevision): RegistroDeDato => ({
  id: reviewStatus,
  reviewStatus,
  fecha: null,
  creadoEn: '2026-10-16T12:00:00.000000Z',
  columnas: {},
});

describe('estados descartados (RN-07)', () => {
  it('nombra en el predicado SQL cada estado de ESTADOS_DESCARTADOS y ningún otro', () => {
    const predicado = sqlDatoVigente('b.review_status');

    const nombrados = TODOS_LOS_ESTADOS.filter((estado) => predicado.includes(`'${estado}'`));

    expect(nombrados).toEqual(TODOS_LOS_ESTADOS.filter((e) => ESTADOS_DESCARTADOS.includes(e)));
    expect(predicado.startsWith('b.review_status NOT IN (')).toBe(true);
  });

  it('descarta en la completitud exactamente los estados de ESTADOS_DESCARTADOS', () => {
    const vigentes = registrosVigentes(TODOS_LOS_ESTADOS.map(registroConEstado));

    expect(vigentes.map(({ reviewStatus }) => reviewStatus)).toEqual(
      TODOS_LOS_ESTADOS.filter((estado) => !ESTADOS_DESCARTADOS.includes(estado)),
    );
  });
});
