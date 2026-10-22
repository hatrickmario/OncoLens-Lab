import { describe, expect, it } from 'vitest';
import {
  evaluarTamanoComponente,
  excepcionesVigentes,
  rutaDeUmbrales,
  validarUmbrales,
} from '../../../scripts/quality/umbrales.mjs';

const BASE = {
  maxLinesPerFunction: 40,
  complexity: 10,
  c901MaxComplexity: 10,
  plr0915MaxStatements: 50,
  web: { componentLinesWarn: 100, componentLinesError: 150 },
  excepciones: [],
};

describe('validarUmbrales', () => {
  it('devuelve los umbrales cuando todas las claves son numéricas [US-213 AC-6]', () => {
    expect(validarUmbrales(BASE)).toEqual(BASE);
  });

  it('falla nombrando la clave cuando falta un umbral [US-213 AC-6]', () => {
    const sinComplexity = { ...BASE, complexity: undefined };
    expect(() => validarUmbrales(sinComplexity)).toThrow(/complexity/);
  });

  it('falla nombrando la clave cuando un umbral no es numérico [US-213 AC-6]', () => {
    expect(() => validarUmbrales({ ...BASE, maxLinesPerFunction: '40' })).toThrow(
      /maxLinesPerFunction/,
    );
  });

  it('falla nombrando la clave anidada cuando falta un umbral de web [US-213 AC-6]', () => {
    expect(() => validarUmbrales({ ...BASE, web: { componentLinesWarn: 100 } })).toThrow(
      /web\.componentLinesError/,
    );
  });

  it('falla cuando el límite de alerta de web supera al de error [US-213 AC-7]', () => {
    expect(() =>
      validarUmbrales({ ...BASE, web: { componentLinesWarn: 150, componentLinesError: 100 } }),
    ).toThrow(/componentLinesWarn/);
  });

  it('falla nombrando caduca cuando la fecha de una excepción no es AAAA-MM-DD [US-213 AC-6]', () => {
    const excepcion = {
      regla: 'complexity',
      archivo: 'a.ts',
      caduca: '30/11/2026',
      motivo: 'deuda',
      historia: 'L1D-263',
    };
    expect(() => validarUmbrales({ ...BASE, excepciones: [excepcion] })).toThrow(/caduca/);
  });

  it('falla nombrando regla cuando se intenta exceptuar una regla de seguridad [US-213 AC-6]', () => {
    const excepcion = {
      regla: 'react/no-danger',
      archivo: 'apps/web/x.tsx',
      caduca: '2026-11-30',
      motivo: 'x',
      historia: 'L1D-263',
    };
    expect(() => validarUmbrales({ ...BASE, excepciones: [excepcion] })).toThrow(/regla/);
  });

  it('falla cuando una excepción no trae regla, archivo, caducidad o motivo [US-213 AC-1]', () => {
    expect(() => validarUmbrales({ ...BASE, excepciones: [{ regla: 'x' }] })).toThrow(
      /excepciones\[0\]/,
    );
  });
});

describe('evaluarTamanoComponente', () => {
  const web = BASE.web;

  it('devuelve ok cuando el componente no supera la alerta', () => {
    expect(evaluarTamanoComponente(100, web)).toBe('ok');
  });

  it('devuelve alerta cuando supera 100 líneas sin pasar de 150 [US-213 AC-7]', () => {
    expect(evaluarTamanoComponente(120, web)).toBe('alerta');
    expect(evaluarTamanoComponente(150, web)).toBe('alerta');
  });

  it('devuelve error cuando supera 150 líneas [US-213 AC-7]', () => {
    expect(evaluarTamanoComponente(151, web)).toBe('error');
  });
});

describe('excepcionesVigentes', () => {
  const excepcion = (caduca) => ({ regla: 'complexity', archivo: 'a.ts', caduca, motivo: 'deuda' });

  it('conserva la excepción cuyo último día de vigencia es hoy', () => {
    const e = excepcion('2026-11-30');
    expect(excepcionesVigentes([e], new Date('2026-11-30T12:00:00Z'))).toEqual([e]);
  });

  it('descarta la excepción caducada para que la violación vuelva a fallar', () => {
    expect(
      excepcionesVigentes([excepcion('2026-11-30')], new Date('2026-12-01T00:00:00Z')),
    ).toEqual([]);
  });
});

describe('validación de excepciones con caducidad', () => {
  const HOY = new Date('2026-10-22T12:00:00Z');
  const excepcion = (cambios = {}) => ({
    regla: 'max-lines-per-function',
    archivo: 'apps/clinical-api/src/x.ts',
    caduca: '2026-11-30',
    motivo: 'deuda',
    historia: 'L1D-263',
    ...cambios,
  });
  const validar = (e) => () => validarUmbrales({ ...BASE, excepciones: [e] }, HOY);

  it('acepta una excepción que caduca dentro del tope de 90 días [US-213 AC-6]', () => {
    expect(validar(excepcion())).not.toThrow();
  });

  it('falla nombrando caduca cuando supera el tope de 90 días desde hoy [US-213 AC-6]', () => {
    expect(validar(excepcion({ caduca: '9999-12-31' }))).toThrow(/caduca.*90/);
  });

  it('falla nombrando historia cuando la excepción no la trae [US-213 AC-6]', () => {
    expect(validar(excepcion({ historia: undefined }))).toThrow(/historia/);
  });

  it('falla nombrando caduca cuando la fecha no existe en el calendario [US-213 AC-6]', () => {
    expect(validar(excepcion({ caduca: '2026-02-31' }))).toThrow(/caduca/);
  });

  it('falla nombrando regla cuando se intenta exceptuar una regla de capas [US-213 AC-6]', () => {
    expect(validar(excepcion({ regla: 'sin-ciclos' }))).toThrow(/regla/);
  });

  it('falla nombrando archivo cuando la ruta sale del repositorio con .. [US-213 AC-6]', () => {
    expect(validar(excepcion({ archivo: '../fuera.ts' }))).toThrow(/archivo/);
  });
});

describe('rutaDeUmbrales', () => {
  it('usa quality-thresholds.json cuando no hay variable [US-213 AC-6]', () => {
    expect(rutaDeUmbrales({})).toMatch(/quality-thresholds\.json$/);
  });

  it('acepta la variable en los tests de Vitest [US-213 AC-6]', () => {
    expect(rutaDeUmbrales({ QUALITY_THRESHOLDS: '/tmp/u.json', VITEST: 'true' })).toBe(
      '/tmp/u.json',
    );
  });

  it('rechaza la variable en la CI fuera de los tests [US-213 AC-6]', () => {
    expect(() => rutaDeUmbrales({ QUALITY_THRESHOLDS: '/tmp/u.json', CI: 'true' })).toThrow(
      /QUALITY_THRESHOLDS/,
    );
  });
});
