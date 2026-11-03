import { describe, expect, it } from 'vitest';
import seguimientoTurno from '../../../../contracts/examples/follow-up-turn.json';
import type { FollowUpTurn } from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  contadorDeSeguimiento,
  textoDelContador,
} from '../../lib/evidence/seguimiento/contador-de-seguimiento';
import { faseTrasSeguimiento } from '../../lib/evidence/seguimiento/fase-tras-seguimiento';
import { numerarCitasDelTurno } from '../../lib/evidence/seguimiento/numerar-citas-del-turno';

const turno = seguimientoTurno as FollowUpTurn;

describe('contadorDeSeguimiento', () => {
  it('devuelve 0 usados y el total del contrato cuando no hay turnos', () => {
    expect(contadorDeSeguimiento([], 10)).toEqual({ usados: 0, total: 10 });
  });

  it('usa el turnNumber del último turno y no la cantidad de turnos recibidos', () => {
    expect(contadorDeSeguimiento([{ turnNumber: 2 }], 10).usados).toBe(2);
  });

  it('no inventa un total cuando el análisis no trae maxFollowUps', () => {
    expect(contadorDeSeguimiento([], undefined)).toEqual({ usados: 0, total: null });
  });

  it('iguala usados al total cuando el servidor respondió que se alcanzó el límite', () => {
    expect(contadorDeSeguimiento([{ turnNumber: 3 }], 10, true).usados).toBe(10);
  });

  it('redacta con total y sin total', () => {
    expect(textoDelContador({ usados: 2, total: 10 })).toBe('2 de 10 preguntas usadas');
    expect(textoDelContador({ usados: 0, total: null })).toBe('0 preguntas usadas');
  });
});

describe('numerarCitasDelTurno', () => {
  it('numera cada cita según su posición en citedSources del turno', () => {
    const [afirmacion] = numerarCitasDelTurno(turno);

    expect(afirmacion!.citas.map(({ numero, cita }) => [numero, cita.chunkId])).toEqual([
      [1, 'chunk_90412'],
      [2, 'chunk_88231'],
    ]);
  });

  it('marca la fuente nueva solo donde isNewSource es true', () => {
    const [afirmacion] = numerarCitasDelTurno(turno);

    expect(afirmacion!.citas.map(({ cita }) => cita.isNewSource)).toEqual([true, false]);
  });

  it('omite una cita que no está en las fuentes del turno', () => {
    const sinFuentes = { ...turno, citedSources: [turno.citedSources[1]!] };

    const [afirmacion] = numerarCitasDelTurno(sinFuentes);

    expect(afirmacion!.citas.map(({ numero }) => numero)).toEqual([1]);
  });
});

describe('faseTrasSeguimiento', () => {
  it('conserva los estados propios del hilo', () => {
    expect(faseTrasSeguimiento({ tipo: 'limite_alcanzado' })).toEqual({ tipo: 'limite_alcanzado' });
    expect(faseTrasSeguimiento({ tipo: 'no_procesable' })).toEqual({ tipo: 'no_procesable' });
  });

  it('clasifica un fallo de servicio como error con su traza', () => {
    expect(
      faseTrasSeguimiento({ tipo: 'error', httpStatus: 502, codigo: null, traceId: 'req_1' }),
    ).toEqual({ tipo: 'error', httpStatus: 502, traceId: 'req_1', codigo: null });
  });
});
