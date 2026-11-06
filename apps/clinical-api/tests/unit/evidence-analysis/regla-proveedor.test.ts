import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clasificacionDelPaciente,
  proveedorPermitido,
} from '../../../src/modules/evidence-analysis/regla-proveedor.js';

describe('proveedorPermitido (RN-12)', () => {
  it.each([
    ['sintetico', 'local', true],
    ['sintetico', 'nube', true],
    ['real_anonimizado', 'local', true],
    ['real_anonimizado', 'nube', false],
    ['real_identificado', 'local', true],
    ['real_identificado', 'nube', false],
  ] as const)('con %s y proveedor %s devuelve %s', (clasificacion, proveedor, esperado) => {
    expect(proveedorPermitido(clasificacion, proveedor)).toBe(esperado);
  });

  it('rechaza cualquier proveedor desconocido porque falla cerrado', () => {
    expect(proveedorPermitido('sintetico', 'otro' as never)).toBe(false);
  });
});

describe('clasificacionDelPaciente (RN-12)', () => {
  it.each(['sintetico', 'real_anonimizado', 'real_identificado'] as const)(
    'devuelve el data_origin %s del paciente',
    (dataOrigin) => {
      expect(clasificacionDelPaciente({ dataOrigin })).toBe(dataOrigin);
    },
  );
});

describe('tabla común de RN-12 con rag-orchestrator', () => {
  const { casos } = JSON.parse(
    readFileSync(
      new URL('../../../../../contracts/reglas/proveedor-llm.json', import.meta.url),
      'utf8',
    ),
  ) as { casos: { clasificacion: string; proveedor: string; permitido: boolean }[] };

  it.each(casos)(
    'coincide con la tabla para $clasificacion y $proveedor',
    ({ clasificacion, proveedor, permitido }) => {
      expect(proveedorPermitido(clasificacion as never, proveedor)).toBe(permitido);
    },
  );
});
