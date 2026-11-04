import { describe, expect, it } from 'vitest';
import opcionesMama from '../../../../contracts/examples/manual-entry-options-mama.json';
import { resolverItem } from '../../lib/registro-manual/resolver-item';

type Opciones = Parameters<typeof resolverItem>[0];
const opciones = opcionesMama as Opciones;

describe('resolverItem', () => {
  it('abre el biomarcador con su término cuando el destino es Biomarker', () => {
    expect(resolverItem(opciones, 'ki67')).toEqual({ entidad: 'Biomarker', termino: 'Ki-67' });
  });

  it('abre el diagnóstico con el foco en su campo cuando el destino es Diagnosis', () => {
    expect(resolverItem(opciones, 'grado')).toEqual({ entidad: 'Diagnosis', campo: 'gradacion' });
    expect(resolverItem(opciones, 'tnm')).toEqual({ entidad: 'Diagnosis', campo: 'stageValue' });
    expect(resolverItem(opciones, 'histologia')).toEqual({
      entidad: 'Diagnosis',
      campo: 'histology',
    });
    expect(resolverItem(opciones, 'ecog')).toEqual({
      entidad: 'Diagnosis',
      campo: 'performanceValue',
    });
  });

  it('devuelve null cuando la clave es desconocida', () => {
    expect(resolverItem(opciones, 'desconocido')).toBeNull();
  });

  it('devuelve null cuando el destino es de otra entidad', () => {
    expect(resolverItem(opciones, 'estado_menopausico')).toBeNull();
    expect(resolverItem(opciones, 'tratamientos_previos')).toBeNull();
  });
});
