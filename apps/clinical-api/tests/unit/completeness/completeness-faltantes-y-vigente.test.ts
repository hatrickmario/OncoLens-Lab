import { describe, expect, it } from 'vitest';
import {
  diagnosticoVigente,
  faltantesDe,
} from '../../../src/modules/completeness/completeness.rules.js';
import type { ItemDelChecklist, RegistroDeDato } from '../../../src/modules/completeness/ports.js';

const itemDe = (key: string, status: ItemDelChecklist['status']): ItemDelChecklist => ({
  key,
  label: key,
  status,
  origin: 'regla',
  provenance: null,
  destination: { entity: 'Diagnosis', field: null },
  condition: null,
});

describe('faltantesDe', () => {
  it('devuelve solo los ítems faltante, en el orden del catálogo, cuando el checklist mezcla estados', () => {
    const checklist = {
      catalogVersion: 'test',
      cancerTypeEnabled: true,
      items: [
        itemDe('a', 'faltante'),
        itemDe('b', 'presente_verificado'),
        itemDe('c', 'no_aplica'),
        itemDe('d', 'faltante'),
        itemDe('e', 'presente_sin_verificar'),
      ],
    };

    expect(faltantesDe(checklist).map((i) => i.key)).toEqual(['a', 'd']);
  });

  it('devuelve una lista vacía cuando el checklist no tiene ítems', () => {
    expect(faltantesDe({ catalogVersion: 'test', cancerTypeEnabled: false, items: [] })).toEqual(
      [],
    );
  });
});

const diagnostico = (id: string, fecha: string | null, creadoEn: string, estado = 'verificado') =>
  ({
    id,
    reviewStatus: estado,
    fecha,
    creadoEn,
    procedencia: { entryMethod: 'seed', sourceDocumentId: null, page: null },
    columnas: { cancer_type: 'mama' },
  }) satisfies RegistroDeDato;

describe('diagnosticoVigente', () => {
  it('elige el de diagnosed_at más reciente aunque se haya creado antes cuando hay varios activos', () => {
    const reciente = diagnostico('b', '2026-06-01', '2026-10-01T00:00:00.000000Z');
    const antiguo = diagnostico('a', '2026-01-01', '2026-10-02T00:00:00.000000Z');

    expect(diagnosticoVigente([antiguo, reciente])?.id).toBe('b');
  });

  it('desempata por id ascendente, como la ficha, cuando la fecha es igual', () => {
    const primero = diagnostico('a', '2026-06-01', '2026-10-01T00:00:00.000000Z');
    const segundo = diagnostico('b', '2026-06-01', '2026-10-09T00:00:00.000000Z');

    expect(diagnosticoVigente([segundo, primero])?.id).toBe('a');
  });

  it('ignora los diagnósticos rechazados y reemplazados', () => {
    const rechazado = diagnostico('a', '2026-09-01', '2026-10-01T00:00:00.000000Z', 'rechazado');
    const vigente = diagnostico('b', '2026-01-01', '2026-10-01T00:00:00.000000Z');

    expect(diagnosticoVigente([rechazado, vigente])?.id).toBe('b');
  });

  it('devuelve undefined cuando no hay ningún diagnóstico vigente', () => {
    expect(diagnosticoVigente([])).toBeUndefined();
  });
});
