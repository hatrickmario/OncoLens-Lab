import { describe, expect, it } from 'vitest';
import ragConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import ragSinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import type { RagQueryInternalResponse } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { TurnoDeConversacion } from '../../../src/modules/evidence-analysis/conversation/conversation.repository.js';
import {
  analisisActivo,
  construirRehidratacion,
  creoElAnalisis,
  derivarEstadoDelTurno,
  enlacesDelTurno,
  etiquetasDeFaltantes,
  estadoDelSeguimiento,
  etiquetasDeHechosUsados,
  ordenarPorDiaRelativo,
  rehidratacionVacia,
} from '../../../src/modules/evidence-analysis/conversation/conversation.reglas.js';
import { clasificacionDelPaciente } from '../../../src/modules/evidence-analysis/regla-proveedor.js';

const ESTADO_VACIO = {
  intentsVistos: [],
  preguntasPrevias: [],
  opcionesMostradas: [],
  citasMostradas: [],
  faltantesSenalados: [],
};

function turno(numero: number, resto: Partial<TurnoDeConversacion> = {}): TurnoDeConversacion {
  return {
    id: `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee${String(numero).padStart(4, 'a')}`,
    conversationId: 'aaaaaaaa-bbbb-4ccc-8ddd-cccccccccccc',
    turnNumber: numero,
    questionMasked: `pregunta ${numero}`,
    intent: 'caso',
    aboutTurnId: null,
    blocks: [],
    dataLinks: [],
    omittedClaims: 0,
    notices: [],
    dataUsed: [],
    dataMissing: [],
    analysisId: null,
    structuredState: { ...ESTADO_VACIO, preguntasPrevias: [`pregunta ${numero}`] },
    llmProvider: 'local',
    llmModel: null,
    promptVersion: null,
    traceId: `req_Turno${String(numero).padStart(4, '0')}`,
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
    ...resto,
  };
}

describe('derivarEstadoDelTurno', () => {
  it('devuelve respondido con topRelevanceScore null cuando el turno no trae evidenceAnalysis', () => {
    expect(derivarEstadoDelTurno('caso', undefined)).toEqual({
      status: 'respondido',
      topRelevanceScore: null,
    });
  });

  it('devuelve no_clasificada cuando la intención es no_clasificada', () => {
    expect(derivarEstadoDelTurno('no_clasificada', undefined)).toEqual({
      status: 'no_clasificada',
      topRelevanceScore: null,
    });
  });

  it('devuelve respondido con el puntaje del análisis cuando hay evidencia', () => {
    const evidencia = ragConEvidencia as unknown as RagQueryInternalResponse;

    expect(derivarEstadoDelTurno('evidencia', evidencia)).toEqual({
      status: 'respondido',
      topRelevanceScore: evidencia.topRelevanceScore,
    });
  });

  it('devuelve sin_evidencia con topRelevanceScore null (no 0.0) cuando el análisis no tiene evidencia', () => {
    const sinEvidencia = ragSinEvidencia as unknown as RagQueryInternalResponse;

    const estado = derivarEstadoDelTurno('evidencia', sinEvidencia);

    expect(estado.status).toBe('sin_evidencia');
    expect(estado.topRelevanceScore).toBeNull();
  });
});

describe('rehidratacionVacia', () => {
  it('devuelve cero turnos y el estado estructurado vacío', () => {
    expect(rehidratacionVacia()).toEqual({ turns: [], structuredState: ESTADO_VACIO });
  });

  it('devuelve un valor nuevo en cada llamada para que nadie comparta el estado', () => {
    expect(rehidratacionVacia()).not.toBe(rehidratacionVacia());
  });
});

describe('construirRehidratacion', () => {
  it('devuelve la rehidratación vacía cuando no hay turnos', () => {
    expect(construirRehidratacion([], 6)).toEqual(rehidratacionVacia());
  });

  it('toma los últimos turnos que caben en el límite, en orden', () => {
    const turnos = [turno(1), turno(2), turno(3)];

    const { turns } = construirRehidratacion(turnos, 2);

    expect(turns.map((item) => item.question)).toEqual(['pregunta 2', 'pregunta 3']);
  });

  it('emite solo question, intent, blocksText y factRefs por turno', () => {
    const conDatos = turno(1, {
      intent: 'faltantes',
      blocks: [
        { kind: 'documentado', text: 'Diagnóstico documentado.', factRefs: ['f1', 'f2'] },
        { kind: 'faltante', text: 'Falta el Ki-67.' },
        { kind: 'documentado', text: 'HER2 sin verificar.', factRefs: ['f2'] },
      ],
      dataLinks: [
        {
          factRef: 'f1',
          resourceType: 'diagnosis',
          resourceId: 'aaaaaaaa-bbbb-4ccc-8ddd-ddddddddddd1',
          origin: 'seed',
          relativeDay: 0,
          recordedDate: '2025-01-15',
        },
      ],
      analysisId: 'aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaa1',
    });

    const { turns } = construirRehidratacion([conDatos], 6);

    expect(turns).toEqual([
      {
        question: 'pregunta 1',
        intent: 'faltantes',
        blocksText: ['Diagnóstico documentado.', 'Falta el Ki-67.', 'HER2 sin verificar.'],
        factRefs: ['f1', 'f2'],
      },
    ]);
  });

  it('devuelve cero turnos y conserva el estado del último cuando el límite es cero o negativo', () => {
    const turnos = [turno(1), turno(2)];

    expect(construirRehidratacion(turnos, 0).turns).toEqual([]);
    expect(construirRehidratacion(turnos, -1).turns).toEqual([]);
    expect(construirRehidratacion(turnos, 0).structuredState.preguntasPrevias).toEqual([
      'pregunta 2',
    ]);
  });

  it('lleva el estado estructurado del último turno persistido', () => {
    const ultimo = turno(3, { structuredState: { ...ESTADO_VACIO, faltantesSenalados: ['ki67'] } });

    const { structuredState } = construirRehidratacion([turno(1), turno(2), ultimo], 1);

    expect(structuredState).toEqual(ultimo.structuredState);
  });

  it('lleva el estado del último turno aunque el límite deje fuera a los anteriores', () => {
    const { turns, structuredState } = construirRehidratacion([turno(1), turno(2)], 1);

    expect(turns).toHaveLength(1);
    expect(structuredState.preguntasPrevias).toEqual(['pregunta 2']);
  });
});

describe('analisisActivo', () => {
  it('devuelve null cuando ningún turno tiene análisis', () => {
    expect(analisisActivo([turno(1), turno(2)])).toBeNull();
  });

  it('devuelve el analysisId del turno más reciente que lo tenga', () => {
    const turnos = [
      turno(1, { analysisId: 'aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaa1' }),
      turno(2, { analysisId: 'aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaa2' }),
      turno(3),
    ];

    expect(analisisActivo(turnos)).toBe('aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaa2');
  });
});

describe('etiquetas de lo enviado', () => {
  it('etiquetasDeHechosUsados devuelve la etiqueta de la clase de cada hecho, en orden', () => {
    const hechos = [
      {
        factRef: 'f1',
        kind: 'diagnostico',
        verbalization: 'x',
        relativeDay: 0,
        reviewStatus: 'verificado',
      },
      {
        factRef: 'f2',
        kind: 'biomarcador',
        verbalization: 'HER2: 3+',
        relativeDay: 0,
        reviewStatus: 'verificado',
      },
    ] as const;

    expect(etiquetasDeHechosUsados(hechos.map((hecho) => ({ ...hecho })))).toEqual([
      'Diagnóstico',
      'Biomarcador',
    ]);
  });

  it('etiquetasDeFaltantes devuelve solo los ítems con tipo de faltante', () => {
    const items = [
      {
        item: 'ki67',
        label: 'Ki-67',
        status: 'faltante',
        gapType: 'no_encontrado',
        destination: 'biomarker',
      },
      {
        item: 'her2',
        label: 'HER2',
        status: 'presente_verificado',
        gapType: null,
        destination: 'biomarker',
      },
      {
        item: 'menopausia',
        label: 'Estado menopáusico',
        status: 'faltante',
        gapType: 'no_buscado',
        destination: 'clinicalAttribute',
      },
    ] as const;

    expect(etiquetasDeFaltantes(items.map((item) => ({ ...item })))).toEqual([
      'Ki-67',
      'Estado menopáusico',
    ]);
  });
});

describe('enlacesDelTurno', () => {
  const mapa = new Map([
    [
      'f1',
      {
        resourceType: 'diagnosis' as const,
        resourceId: 'id-1',
        origin: 'seed' as const,
        relativeDay: 0,
        recordedDate: '2025-08-16',
      },
    ],
    [
      'f2',
      {
        resourceType: 'biomarker' as const,
        resourceId: 'id-2',
        origin: 'ocr' as const,
        relativeDay: 30,
        recordedDate: null,
      },
    ],
  ]);

  it('devuelve un enlace por factRef distinto en orden ascendente de día relativo', () => {
    const resultado = enlacesDelTurno(
      [
        { kind: 'documentado', text: 'a', factRefs: ['f2', 'f1'] },
        { kind: 'documentado', text: 'b', factRefs: ['f1'] },
        { kind: 'limitacion', text: 'c' },
      ],
      mapa,
    );

    expect(resultado).toEqual({
      ok: true,
      enlaces: [
        { factRef: 'f1', ...mapa.get('f1') },
        { factRef: 'f2', ...mapa.get('f2') },
      ],
    });
  });

  it('señala el factRef que el turno no envió', () => {
    const resultado = enlacesDelTurno(
      [{ kind: 'documentado', text: 'a', factRefs: ['f1', 'f9'] }],
      mapa,
    );

    expect(resultado).toEqual({ ok: false, factRefSinResolver: 'f9' });
  });

  it('devuelve una lista vacía cuando ningún bloque lleva factRefs', () => {
    expect(enlacesDelTurno([{ kind: 'fuente', text: 'x' }], mapa)).toEqual({
      ok: true,
      enlaces: [],
    });
  });
});

describe('clasificacionDelPaciente', () => {
  it('devuelve el origen de los datos del paciente', () => {
    expect(clasificacionDelPaciente({ dataOrigin: 'sintetico' })).toBe('sintetico');
    expect(clasificacionDelPaciente({ dataOrigin: 'real_anonimizado' })).toBe('real_anonimizado');
  });
});

describe('ordenarPorDiaRelativo', () => {
  const enlace = (factRef: string, relativeDay: number | null) => ({
    factRef,
    resourceType: 'biomarker' as const,
    resourceId: `id-${factRef}`,
    origin: 'manual' as const,
    relativeDay,
    recordedDate: null,
  });

  it('ordena de menor a mayor día relativo cuando los enlaces llegan desordenados', () => {
    const ordenados = ordenarPorDiaRelativo([enlace('f3', 180), enlace('f1', 0), enlace('f2', 90)]);

    expect(ordenados.map((e) => e.factRef)).toEqual(['f1', 'f2', 'f3']);
  });

  it('pone al final el enlace sin fecha confiable y no lo trata como el día cero', () => {
    const ordenados = ordenarPorDiaRelativo([enlace('f1', null), enlace('f2', 5), enlace('f3', 0)]);

    expect(ordenados.map((e) => e.factRef)).toEqual(['f3', 'f2', 'f1']);
  });

  it('conserva el orden de llegada cuando dos enlaces tienen el mismo día', () => {
    const ordenados = ordenarPorDiaRelativo([enlace('fb', 10), enlace('fa', 10)]);

    expect(ordenados.map((e) => e.factRef)).toEqual(['fb', 'fa']);
  });
});

describe('Seguimiento del análisis activo (L1D-322)', () => {
  const evidencia = (puntaje: number | null) => ({
    ...ESTADO_VACIO,
    ultimaEvidencia: { query: 'p', chunkIds: ['c1'], topRelevanceScore: puntaje },
  });

  it('toma el puntaje de ultimaEvidencia y responde respondido cuando hubo evidencia', () => {
    expect(estadoDelSeguimiento(evidencia(0.84))).toEqual({
      status: 'respondido',
      topRelevanceScore: 0.84,
    });
  });

  it('responde sin_evidencia con puntaje null y no 0.0 cuando ningún chunk superó el umbral', () => {
    const estado = estadoDelSeguimiento(evidencia(null));

    expect(estado).toEqual({ status: 'sin_evidencia', topRelevanceScore: null });
  });

  it('trata como sin_evidencia un estado sin ultimaEvidencia', () => {
    expect(estadoDelSeguimiento(ESTADO_VACIO).topRelevanceScore).toBeNull();
  });

  it('considera creador del análisis solo al primer turno que lo referencia', () => {
    const id = 'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const turnos = [turno(1), turno(2, { analysisId: id }), turno(3, { analysisId: id })];

    expect(turnos.map((t) => creoElAnalisis(turnos, t))).toEqual([false, true, false]);
  });
});
