import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readPacientesConfig } from '../../src/config/index.js';

describe('readPacientesConfig', () => {
  it('aplica el tamaño de página por defecto cuando PATIENTS_PAGE_SIZE no está', () => {
    expect(readPacientesConfig({})).toEqual({ pageSize: 20 });
  });

  it('lee PATIENTS_PAGE_SIZE del entorno', () => {
    expect(readPacientesConfig({ PATIENTS_PAGE_SIZE: '3' })).toEqual({ pageSize: 3 });
  });

  it('rechaza nombrando la variable cuando PATIENTS_PAGE_SIZE no es un entero positivo', () => {
    expect(() => readPacientesConfig({ PATIENTS_PAGE_SIZE: '0' })).toThrow(
      ConfiguracionInvalidaError,
    );
  });
});
