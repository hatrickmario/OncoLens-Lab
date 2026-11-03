import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { componerModuloDeAtributos } from '../../../src/modules/clinical-attributes/clinical-attributes.module.js';
import { componerModuloDeTratamientos } from '../../../src/modules/prior-treatments/prior-treatments.module.js';
import {
  incoherencias,
  leerOperacionesDelContrato,
  operacionDeLaRuta,
  rutasMontadas,
} from '../../support/rutas-y-contrato.js';
import { loggerEnMemoria } from '../../support/usuarios.js';

const RUTA_DEL_SPEC = resolve(fileURLToPath(new URL('../../../openapi.yaml', import.meta.url)));
const SIN_USO = {
  fuente: { connect: () => Promise.reject(new Error('no se usa: solo se recorren las rutas')) },
  reloj: { now: () => new Date('2026-10-16T12:00:00.000Z') },
  generarId: () => 'no-se-usa',
  traceIds: { traceId: () => 'req_Coherencia02' },
  registrar: loggerEnMemoria().registrar,
};

function montar() {
  return [
    componerModuloDeTratamientos({
      ...SIN_USO,
      reconciliacionPara: () => ({ decidir: () => Promise.reject(new Error('no se usa')) as never }),
    }),
    componerModuloDeAtributos({
      ...SIN_USO,
      catalogo: { version: () => 'no-se-usa', atributosPermitidos: () => [] },
    }),
  ];
}

describe('coherencia de prior-treatments y clinical-attributes con el contrato [US-045 AC-3]', () => {
  it('monta las tres operaciones con el permiso de su x-permission y sin incoherencias', () => {
    const routers = montar();

    const operaciones = leerOperacionesDelContrato();
    const porOperacion = Object.fromEntries(
      rutasMontadas(routers).map((ruta) => [
        operacionDeLaRuta(ruta, operaciones)?.operationId,
        ruta.permisos,
      ]),
    );

    expect(porOperacion).toEqual({
      createManualPriorTreatment: ['clinical:write'],
      listClinicalAttributes: ['clinical:read'],
      createManualClinicalAttribute: ['clinical:write'],
    });
    expect(incoherencias(routers)).toEqual([]);
  });
});

describe('la propiedad field en los 422 de registro [US-094 AC-5] [ADR-26] [S5 resp. 10]', () => {
  it('es opcional en los tres schemas de error de registro y no figura entre sus campos requeridos', () => {
    const spec = YAML.parse(readFileSync(RUTA_DEL_SPEC, 'utf8')) as {
      components: {
        schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
      };
    };

    for (const nombre of [
      'ErrorRegistroClinicoInvalido',
      'ErrorRegistroManualInvalido',
      'ErrorDiagnosticoInvalido',
    ]) {
      const schema = spec.components.schemas[nombre];
      expect(schema?.properties?.['field'], nombre).toBeDefined();
      expect(schema?.required, nombre).not.toContain('field');
    }
  });
});
