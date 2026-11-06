import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { componerModuloDeCorrecciones } from '../../../src/modules/corrections/corrections.module.js';
import {
  incoherencias,
  leerOperacionesDelContrato,
  operacionDeLaRuta,
  rutasMontadas,
} from '../../support/rutas-y-contrato.js';
import { loggerEnMemoria } from '../../support/usuarios.js';

const RUTA_DEL_SPEC = resolve(fileURLToPath(new URL('../../../openapi.yaml', import.meta.url)));
const DESCRIPCION_DE_FIELD =
  'Propiedad del cuerpo que causó el error, cuando el error es de un campo; ausente si no lo es (p. ej. PACIENTE_EGRESADO). Nunca repite el valor enviado.';

function montar() {
  return componerModuloDeCorrecciones({
    fuente: { connect: () => Promise.reject(new Error('no se usa: solo se recorren las rutas')) },
    reconciliacionPara: () => ({ decidir: () => Promise.reject(new Error('no se usa')) as never }),
    catalogoDeAtributos: { version: () => 'no-se-usa', atributosPermitidos: () => [] },
    limites: { notaMaxChars: 200, historialMax: 50 },
    reloj: { now: () => new Date('2026-10-16T12:00:00.000Z') },
    generarId: () => 'no-se-usa',
    traceIds: { traceId: () => 'req_Coherencia01' },
    registrar: loggerEnMemoria().registrar,
  });
}

describe('coherencia del módulo corrections con el contrato [US-045 AC-3]', () => {
  it('monta las nueve operaciones con el permiso de su x-permission y sin incoherencias', () => {
    const router = montar();

    const montadas = rutasMontadas([router]);
    const operaciones = leerOperacionesDelContrato();
    const porOperacion = Object.fromEntries(
      montadas.map((ruta) => [operacionDeLaRuta(ruta, operaciones)?.operationId, ruta.permisos]),
    );

    expect(porOperacion).toEqual({
      correctBiomarker: ['clinical:write'],
      correctClinicalAttribute: ['clinical:write'],
      correctClinicalNote: ['clinical:write'],
      correctPriorTreatment: ['clinical:write'],
      getBiomarkerHistory: ['clinical:read'],
      getClinicalAttributeHistory: ['clinical:read'],
      getClinicalNoteHistory: ['clinical:read'],
      getPriorTreatmentHistory: ['clinical:read'],
      listClinicalNotes: ['clinical:read'],
    });
    expect(incoherencias([router])).toEqual([]);
  });
});

describe('la descripción de field en los 422 de registro [S5 resp. 10]', () => {
  it('es literalmente la misma en todos los schemas de error que declaran field', () => {
    const spec = YAML.parse(readFileSync(RUTA_DEL_SPEC, 'utf8')) as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    const conField = Object.entries(spec.components.schemas)
      .filter(
        ([nombre, schema]) =>
          nombre.startsWith('Error') && schema.properties?.['field'] !== undefined,
      )
      .map(([nombre, schema]) => ({
        nombre,
        field: schema.properties?.['field'] as {
          type?: string;
          enum?: unknown;
          description?: string;
        },
      }));

    expect(conField.map((e) => e.nombre)).toContain('ErrorCorreccionInvalida');
    for (const { nombre, field } of conField) {
      expect(field.type, nombre).toBe('string');
      expect(field.enum, nombre).toBeUndefined();
      expect(field.description?.replaceAll(/\s+/g, ' '), nombre).toBe(DESCRIPCION_DE_FIELD);
    }
  });
});
