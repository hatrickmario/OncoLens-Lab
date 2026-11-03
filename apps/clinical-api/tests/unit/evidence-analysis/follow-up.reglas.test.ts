import { describe, expect, it } from 'vitest';
import ragSeguimiento from '../../../../../contracts/examples/rag-follow-up-response.json' with { type: 'json' };
import ragTresOpciones from '../../../../../contracts/examples/rag-query-tres-opciones.json' with { type: 'json' };
import type { CitedSource } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import {
  chunksCitadosPorElAnalisis,
  enlacesDelTurno,
  marcarFuentesNuevas,
  superaLimiteDeSeguimiento,
} from '../../../src/modules/evidence-analysis/follow-up.reglas.js';

const analisis = validarRespuestaInterna(ragTresOpciones);

describe('superaLimiteDeSeguimiento', () => {
  it('es falso cuando el análisis tiene menos turnos que el máximo configurado', () => {
    expect(superaLimiteDeSeguimiento(9, 10)).toBe(false);
  });

  it('es verdadero cuando el análisis ya tiene el máximo de turnos, sea cual sea el máximo configurado', () => {
    expect(superaLimiteDeSeguimiento(10, 10)).toBe(true);
    expect(superaLimiteDeSeguimiento(2, 2)).toBe(true);
  });
});

describe('chunksCitadosPorElAnalisis', () => {
  it('reúne los chunkId citados por las opciones y por la síntesis del análisis', () => {
    const chunks = chunksCitadosPorElAnalisis(analisis.evidenceOptions, analisis.synthesis);

    expect([...chunks]).toEqual(expect.arrayContaining(['ch-a1-1', 'ch-a3-1', 'ch-a6-1']));
  });
});

describe('marcarFuentesNuevas', () => {
  const plantilla = ragSeguimiento.citedSources[0] as CitedSource;
  const cita = (chunkId: string): CitedSource => ({ ...plantilla, chunkId });

  it('marca isNewSource en false para el chunk que el análisis ya citó y en true para el que no', () => {
    const marcadas = marcarFuentesNuevas(
      [cita('ch-a1-1'), cita('ch-a5-1')],
      new Set(['ch-a1-1', 'ch-a3-1']),
    );

    expect(marcadas.map(({ chunkId, isNewSource }) => [chunkId, isNewSource])).toEqual([
      ['ch-a1-1', false],
      ['ch-a5-1', true],
    ]);
  });

  it('copia el resto de los campos de la cita sin cambios', () => {
    const [marcada] = marcarFuentesNuevas([cita('ch-a1-1')], new Set());

    const { isNewSource, ...resto } = marcada!;
    expect(isNewSource).toBe(true);
    expect(resto).toEqual(cita('ch-a1-1'));
  });

  it('devuelve una lista vacía cuando el turno no cita fuentes', () => {
    expect(marcarFuentesNuevas([], new Set(['ch-a1-1']))).toEqual([]);
  });
});

describe('enlacesDelTurno', () => {
  const enlaces = [
    { dataRef: 'r1', entityType: 'diagnosis' as const, entityId: 'dx-1' },
    { dataRef: 'r2', entityType: 'biomarker' as const, entityId: 'bm-2' },
    { dataRef: 'r3', entityType: 'biomarker' as const, entityId: 'bm-3' },
  ];
  const afirmacion = (patientDataRefs: string[]) => ({
    text: 'x',
    citedSources: [],
    patientDataRefs,
  });

  it('resuelve solo los dataRef que citan las afirmaciones, en el orden del análisis y sin repetir', () => {
    const resultado = enlacesDelTurno([afirmacion(['r3', 'r1']), afirmacion(['r1'])], enlaces);

    expect(resultado.enlaces.map((e) => e.entityId)).toEqual(['dx-1', 'bm-3']);
    expect(resultado.sinResolver).toEqual([]);
  });

  it('informa los dataRef que el análisis no conoce', () => {
    const resultado = enlacesDelTurno([afirmacion(['r1', 'r9'])], enlaces);

    expect(resultado.sinResolver).toEqual(['r9']);
  });
});
