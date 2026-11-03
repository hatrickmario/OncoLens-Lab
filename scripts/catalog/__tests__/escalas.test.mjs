import { afterEach, describe, expect, it } from 'vitest';
import {
  CATALOGO,
  PLAZO_PROCESO_MS,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

afterEach(limpiarCopias);

describe('catalog:validate · escalas.json (L1D-90, [US-110 AC-5])', () => {
  it(
    'acepta el catálogo real con escalas.json cuando el manifiesto lo declara [US-110 AC-5]',
    () => {
      const resultado = ejecutarValidador(CATALOGO);

      expect(resultado.codigo).toBe(0);
      expect(resultado.salida).toContain('catalogVersion=1.3.0');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'acepta el fixture test-normalizacion-1.0.0 con ECOG 0-5 y TNM_8 [US-110 AC-5]',
    () => {
      const resultado = ejecutarValidador(copiarFixture('test-normalizacion-1.0.0'));

      expect(resultado.codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una escala funcional que no existe en el enum performance_scale [US-110 AC-5]',
    () => {
      const catalogo = copiarFixture('test-normalizacion-1.0.0');
      modificarJson(catalogo, 'escalas.json', (c) => {
        c.escalasFuncionales.push({ codigo: 'Zubrod', minimo: 0, maximo: 5 });
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('escala_desconocida catalogo/?');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una escala con minimo mayor que maximo [US-110 AC-5]',
    () => {
      const catalogo = copiarFixture('test-normalizacion-1.0.0');
      modificarJson(catalogo, 'escalas.json', (c) => {
        c.escalasFuncionales[0].minimo = 9;
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('rango_invertido catalogo/?');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un sistema de gradación ajeno al contrato y un tipo de cáncer fuera del manifiesto [US-110 AC-5]',
    () => {
      const catalogo = copiarFixture('test-normalizacion-1.0.0');
      modificarJson(catalogo, 'escalas.json', (c) => {
        c.sistemasDeGradacion.push({ codigo: 'fuhrman', tiposDeCancer: ['rinon'] });
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('gradacion_desconocida catalogo/fuhrman');
      expect(resultado.salida).toContain('tipo_de_cancer_ajeno catalogo/fuhrman');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un escalas.json que no cumple su esquema [US-110 AC-5]',
    () => {
      const catalogo = copiarFixture('test-normalizacion-1.0.0');
      modificarJson(catalogo, 'escalas.json', (c) => {
        delete c.escalasFuncionales;
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('esquema_invalido catalogo/escalas');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'valida un catálogo anterior sin escalas.json cuando el manifiesto no lo declara [US-110 AC-5]',
    () => {
      const resultado = ejecutarValidador(copiarFixture('test-1.0.0'));

      expect(resultado.codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});
