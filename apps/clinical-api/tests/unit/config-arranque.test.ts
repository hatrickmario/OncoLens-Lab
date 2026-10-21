import { describe, expect, it } from 'vitest';
import {
  ConfiguracionInvalidaError,
  GateDeDatosRealesNoSuperado,
  cargarConfiguracion,
  exigirAppEnv,
  exigirGateDeDatosReales,
  leerBooleano,
  leerEnumNoSensible,
  observarEntorno,
  readLogsConfig,
  readPort,
  readSesionConfig,
} from '../../src/config/index.js';
import { registrarConfiguracionInvalida } from '../../src/startup.js';

const TIPOS = ['mama', 'prostata'] as const;

function capturarError(accion: () => unknown): ConfiguracionInvalidaError {
  try {
    accion();
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) return error;
    throw error;
  }
  throw new Error('se esperaba ConfiguracionInvalidaError');
}

function lineaDe(error: ConfiguracionInvalidaError): Record<string, unknown> {
  const lineas: string[] = [];
  registrarConfiguracionInvalida((linea) => lineas.push(linea), error);
  return JSON.parse(lineas.join('\n')) as Record<string, unknown>;
}

describe('leerEnumNoSensible', () => {
  it('registra el elemento en valorInvalido y el motivo valor_invalido cuando es un valor de forma segura fuera del enum [US-037 AC-2]', () => {
    const error = capturarError(() =>
      leerEnumNoSensible({ TIPO_DE_PRUEBA: 'leucemia' }, 'TIPO_DE_PRUEBA', TIPOS, 'mama'),
    );

    expect(lineaDe(error)).toMatchObject({
      event: 'configuracion_invalida',
      variable: 'TIPO_DE_PRUEBA',
      motivo: 'valor_invalido',
      valorInvalido: 'leucemia',
    });
  });

  it('omite valorInvalido y no deja el valor en la línea cuando no cumple la forma cerrada [US-037 AC-2]', () => {
    const error = capturarError(() =>
      leerEnumNoSensible({ TIPO_DE_PRUEBA: 'Lucía Rondón' }, 'TIPO_DE_PRUEBA', TIPOS, 'mama'),
    );

    const linea = lineaDe(error);
    expect(linea).not.toHaveProperty('valorInvalido');
    expect(JSON.stringify(linea)).not.toContain('Lucía');
    expect(error.message).not.toContain('Lucía');
  });

  it('devuelve el valor por defecto cuando la variable está ausente o vacía', () => {
    expect(leerEnumNoSensible({}, 'TIPO_DE_PRUEBA', TIPOS, 'mama')).toBe('mama');
    expect(leerEnumNoSensible({ TIPO_DE_PRUEBA: '' }, 'TIPO_DE_PRUEBA', TIPOS, 'prostata')).toBe(
      'prostata',
    );
  });

  it('devuelve el valor cuando pertenece al enum', () => {
    expect(
      leerEnumNoSensible({ TIPO_DE_PRUEBA: 'prostata' }, 'TIPO_DE_PRUEBA', TIPOS, 'mama'),
    ).toBe('prostata');
  });
});

describe('configuracion_invalida sin valorInvalido', () => {
  it('no admite valorInvalido en una clave que no lo declara: un entero inválido registra variable, regla y motivo solamente [US-037 AC-2]', () => {
    const error = capturarError(() => readSesionConfig({ SESSION_IDLE_MINUTES: '12abc' }));

    expect(lineaDe(error)).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'SESSION_IDLE_MINUTES',
      regla: 'debe ser un entero positivo',
      motivo: 'valor_invalido',
    });
  });

  it('usa el motivo variable_ausente cuando falta una variable obligatoria', () => {
    const error = capturarError(() => exigirAppEnv({}));

    expect(error.motivo).toBe('variable_ausente');
  });
});

describe('exigirGateDeDatosReales', () => {
  it('no lanza cuando los datos reales están deshabilitados', () => {
    expect(() =>
      exigirGateDeDatosReales({ anonymizedEnabled: false, identifiedEnabled: false }),
    ).not.toThrow();
  });

  it.each([
    [{ anonymizedEnabled: true, identifiedEnabled: false }, 'REAL_ANONYMIZED_ENABLED'],
    [{ anonymizedEnabled: false, identifiedEnabled: true }, 'REAL_IDENTIFIED_ENABLED'],
    [{ anonymizedEnabled: true, identifiedEnabled: true }, 'REAL_ANONYMIZED_ENABLED'],
  ])(
    'lanza GateDeDatosRealesNoSuperado con la variable %# habilitada [US-037 AC-3]',
    (datos, variable) => {
      expect(() => exigirGateDeDatosReales(datos)).toThrow(GateDeDatosRealesNoSuperado);
      expect(() => exigirGateDeDatosReales(datos)).toThrow(variable);
    },
  );
});

describe('cargarConfiguracion', () => {
  const secretos = {
    IDENTITY_AES_KEY_FILE: '/run/secrets/aes',
    BLIND_INDEX_HMAC_KEY_FILE: '/run/secrets/hmac',
  };

  it('deja los datos reales deshabilitados por defecto (RN-13)', () => {
    expect(cargarConfiguracion(secretos).datosReales).toEqual({
      anonymizedEnabled: false,
      identifiedEnabled: false,
    });
  });

  it('acepta true y false sin distinguir mayúsculas y rechaza cualquier otro valor sin citarlo', () => {
    expect(leerBooleano({ X: ' TRUE ' }, 'X', false)).toBe(true);
    const error = capturarError(() => leerBooleano({ X: 'sí-quiero' }, 'X', false));
    expect(error.variable).toBe('X');
    expect(error.message).not.toContain('sí-quiero');
  });

  it('usa 30 minutos de inactividad por defecto (RN-22)', () => {
    expect(readSesionConfig({}).idleMinutes).toBe(30);
  });
});

describe('readLogsConfig', () => {
  it('devuelve los campos extra sin espacios ni vacíos cuando LOG_REDACT_EXTRA_FIELDS los lista', () => {
    expect(
      readLogsConfig({ LOG_REDACT_EXTRA_FIELDS: ' notaInterna, otro.campo ,,' })
        .camposSensiblesExtra,
    ).toEqual(['notaInterna', 'otro.campo']);
  });

  it('devuelve una lista vacía cuando la variable está ausente', () => {
    expect(readLogsConfig({}).camposSensiblesExtra).toEqual([]);
  });

  it('nombra la variable y no el valor cuando un nombre de campo es inválido', () => {
    const error = capturarError(() => readLogsConfig({ LOG_REDACT_EXTRA_FIELDS: 'ok,no válido!' }));

    expect(error.variable).toBe('LOG_REDACT_EXTRA_FIELDS');
    expect(error.message).not.toContain('no válido');
  });
});

/** Lee una clave ausente (vacía): no debe figurar entre las cargadas. */
function leerClaveVacia(env: NodeJS.ProcessEnv): void {
  void env['AUSENTE'];
}

describe('observarEntorno', () => {
  it('lista ordenados solo los nombres de las claves leídas con valor, sin valores ni variables ajenas [US-037 AC-1]', () => {
    const observado = observarEntorno({
      PORT: '4100',
      SESSION_IDLE_MINUTES: '45',
      PATH: '/usr/bin',
      AUSENTE: '',
    });

    readSesionConfig(observado.env);
    readPort(observado.env);
    leerClaveVacia(observado.env);

    expect(observado.clavesCargadas()).toEqual(['PORT', 'SESSION_IDLE_MINUTES']);
  });
});
