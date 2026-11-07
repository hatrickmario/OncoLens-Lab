import { describe, expect, it } from 'vitest';
import {
  construirContextoDelChat,
  contextosDeContrapartes,
} from '../../../src/modules/evidence-analysis/clinical-context.builder.js';
import { construirHechosDelCaso } from '../../../src/modules/evidence-analysis/conversation/hechos-del-caso.js';
import {
  AHORA_DE_EJEMPLO,
  biomarcadorDeEjemplo,
  casoDeEjemplo,
  diagnosticoDeEjemplo,
} from './casos.js';

const activo = diagnosticoDeEjemplo({
  id: 'dx-iia',
  cancerType: 'mama',
  stageValue: 'IIA',
  diagnosedAt: '2026-01-10',
});
const enConflicto = diagnosticoDeEjemplo({
  id: 'dx-iib',
  cancerType: 'mama',
  stageValue: 'IIB',
  diagnosedAt: '2026-01-20',
  reviewStatus: 'requiere_revision',
  conflictsWithId: 'dx-iia',
});

function hechosDe(caso = casoDeEjemplo({ diagnosticoActivo: activo })) {
  const { contexto, dataRefs } = construirContextoDelChat(caso, AHORA_DE_EJEMPLO, []);
  const contrapartes = contextosDeContrapartes(caso, AHORA_DE_EJEMPLO).map(
    ({ contexto: c, enlace }) => ({
      diagnostico: c.diagnosis as NonNullable<typeof c.diagnosis>,
      enlace,
    }),
  );
  return construirHechosDelCaso({ ...contexto, pseudoPatientId: 'psd_x' }, dataRefs, contrapartes);
}

describe('construirHechosDelCaso: conflictos', () => {
  it('añade al final el diagnóstico en conflicto y marca a los dos con el factRef del otro', () => {
    const { caseFacts, enlaces } = hechosDe(
      casoDeEjemplo({ diagnosticoActivo: activo, diagnosticosEnConflicto: [enConflicto] }),
    );

    const [iia, iib] = caseFacts;
    expect(caseFacts).toHaveLength(2);
    expect(iia).toMatchObject({ factRef: 'f1', relativeDay: 0, conflictWith: 'f2' });
    expect(iib).toMatchObject({
      factRef: 'f2',
      relativeDay: 10,
      reviewStatus: 'requiere_revision',
      conflictWith: 'f1',
    });
    expect(iib?.verbalization).toContain('estadio IIB');
    expect(enlaces.get('f2')).toMatchObject({ resourceType: 'diagnosis', resourceId: 'dx-iib' });
  });

  it('marca el par entre dos biomarcadores vigentes que se apuntan con conflicts_with_id', () => {
    const { caseFacts } = hechosDe(
      casoDeEjemplo({
        diagnosticoActivo: activo,
        biomarcadores: [
          biomarcadorDeEjemplo({ id: 'b1', performedAt: '2026-02-01' }),
          biomarcadorDeEjemplo({
            id: 'b2',
            performedAt: '2026-03-01',
            reviewStatus: 'requiere_revision',
            conflictsWithId: 'b1',
          }),
        ],
      }),
    );

    expect(caseFacts.filter((h) => h.conflictWith !== undefined).map((h) => h.factRef)).toEqual([
      'f2',
      'f3',
    ]);
  });

  it('no marca ningún hecho cuando no hay conflictos', () => {
    const { caseFacts } = hechosDe();

    expect(caseFacts.some((h) => h.conflictWith !== undefined)).toBe(false);
  });

  it('escribe (corregido) en la verbalización del dato corregido', () => {
    const { caseFacts } = hechosDe(
      casoDeEjemplo({
        diagnosticoActivo: activo,
        biomarcadores: [
          biomarcadorDeEjemplo({
            name: 'HER2',
            value: '3+',
            clinicalSignificance: 'relevante',
            entryMethod: 'manual_correction',
            reviewStatus: 'corregido',
          }),
        ],
      }),
    );

    expect(caseFacts.find((h) => h.corrected === true)?.verbalization).toBe(
      'HER2: 3+, relevante (corregido)',
    );
  });
});
