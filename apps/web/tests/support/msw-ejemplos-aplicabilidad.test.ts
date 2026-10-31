import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  conEvidenciaAplicabilidad,
  conEvidenciaPoblacionA_M2,
  conEvidenciaPoblacionA_M2B,
  conEvidenciaPoblacionLista,
  conEvidenciaPoblacionNoComparable,
  crearBffAnalisisSimulado,
  peticion,
} from './msw/evidence-analyses';

type Criterio = {
  status: string;
  unknownReason: string | null;
  partialReason?: string | null;
  studyPopulationValues?: { scope: string }[];
};
type Cuerpo = { applicability: { criteria: Criterio[] }[] };

const criteriosDe = (c: unknown) => (c as Cuerpo).applicability.flatMap((a) => a.criteria);
const bff = crearBffAnalisisSimulado();

describe('Ejemplos de aplicabilidad servidos por MSW (L1D-131)', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  beforeEach(bff.reiniciar);

  it('sirve cada ejemplo del contrato tal cual por POST /api/evidence-analyses', async () => {
    const ejemplos = [
      conEvidenciaPoblacionA_M2,
      conEvidenciaPoblacionA_M2B,
      conEvidenciaPoblacionLista,
      conEvidenciaAplicabilidad,
      conEvidenciaPoblacionNoComparable,
    ];
    for (const cuerpo of ejemplos) {
      bff.responder({ status: 200, cuerpo });
      const respuesta = await fetch('http://localhost/api/evidence-analyses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(peticion),
      });
      expect(await respuesta.json()).toEqual(cuerpo);
    }
  });

  it('cubre conflicto, Parcial inclusiva y mezclada, subgrupo, 4 valores, respaldo fallido y sin regla de comparación', () => {
    const a = criteriosDe(conEvidenciaPoblacionA_M2);
    const b = criteriosDe(conEvidenciaPoblacionA_M2B);
    const causas = [...a, ...b].map((c) => c.unknownReason).filter(Boolean);
    expect(causas).toEqual(
      expect.arrayContaining([
        'respaldo_fallido',
        'no_reportado_por_fuente',
        'valores_en_conflicto',
        'sin_regla_de_comparacion',
      ]),
    );
    expect(a.map((c) => c.partialReason)).toEqual(
      expect.arrayContaining(['inclusiva', 'mezclada']),
    );
    expect(a.some((c) => c.studyPopulationValues?.some((v) => v.scope === 'subgrupo'))).toBe(true);
    expect(b.some((c) => (c.studyPopulationValues?.length ?? 0) === 4)).toBe(true);
  });

  it('conserva un Desconocido sin causa en el análisis histórico', () => {
    const sinCausa = criteriosDe(conEvidenciaPoblacionNoComparable).filter(
      (c) => c.status === 'desconocido' && c.unknownReason === null,
    );
    expect(sinCausa.length).toBeGreaterThan(0);
  });
});
