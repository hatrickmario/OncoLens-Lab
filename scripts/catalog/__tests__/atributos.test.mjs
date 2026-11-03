import { readFileSync } from 'node:fs';
import path from 'node:path';
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

const atributosReales = () =>
  JSON.parse(readFileSync(path.join(CATALOGO, 'atributos.json'), 'utf8')).keys;
const valoresDe = (clave) => atributosReales().find((k) => k.key === clave)?.values.map((v) => v.value);

describe('catalog:validate · atributos.json con valores permitidos (L1D-80, [US-094 AC-3])', () => {
  it(
    'acepta el catálogo real 1.4.0 y declara los valores de cada atributo [US-094 AC-3]',
    () => {
      const resultado = ejecutarValidador(CATALOGO);

      expect(resultado.codigo).toBe(0);
      expect(resultado.salida).toContain('catalogVersion=1.4.0');
      expect(valoresDe('estado_menopausico')).toContain('posmenopausica');
      expect(valoresDe('estado_castracion')).toEqual(
        expect.arrayContaining(['castrado', 'sensible_castracion']),
      );
      expect(valoresDe('sitios_metastasicos')).toContain('oseo');
    },
    PLAZO_PROCESO_MS,
  );

  it('declara valores no vacíos para cada clave del catálogo real [US-094 AC-3]', () => {
    for (const clave of atributosReales()) {
      expect(clave.values?.length, clave.key).toBeGreaterThan(0);
    }
  });

  it(
    'rechaza un atributo con values vacío y nombra la clave [US-094 AC-3]',
    () => {
      const catalogo = copiarFixture('test-normalizacion-1.0.0');
      modificarJson(catalogo, 'atributos.json', (c) => {
        c.keys[0].values = [];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('estado_menopausico');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un atributo que repite un valor y nombra la clave [US-094 AC-3]',
    () => {
      const catalogo = copiarFixture('test-normalizacion-1.0.0');
      modificarJson(catalogo, 'atributos.json', (c) => {
        const valor = { value: 'posmenopausica', label: { es: 'Posmenopáusica' } };
        c.keys[0].values = [valor, { ...valor, label: { es: 'Otra etiqueta' } }];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('valor_repetido catalogo/estado_menopausico');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'sigue aceptando un fixture cuyos atributos no declaran values [US-094 AC-3]',
    () => {
      const resultado = ejecutarValidador(copiarFixture('test-normalizacion-1.0.0'));

      expect(resultado.codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});
