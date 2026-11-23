import { afterEach, describe, expect, it } from 'vitest';
import {
  CATALOGO,
  PLAZO_PROCESO_MS,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

/**
 * G2.6 (S7.4, design D15): la `version` propia de cada archivo del catálogo no puede ser mayor que `manifest.version`
 * (el archivo que cambia de contenido sube la suya hasta la del manifiesto, nunca más allá). Igualdad y menor, válidas:
 * hoy conviven `1.1.0`, `1.3.0` y `1.9.0` bajo un manifiesto `1.9.0`.
 */
afterEach(limpiarCopias);

describe('catalog:validate · versión propia de cada archivo frente a manifest.version (G2.6)', () => {
  it(
    'valida el catálogo vigente cuando sus archivos llevan versiones iguales o menores que el manifiesto',
    () => {
      const resultado = ejecutarValidador(CATALOGO);

      expect(resultado.codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza con version_mayor_que_manifiesto y nombra el archivo cuando un archivo por tipo trae una versión mayor [US-121 AC-1]',
    () => {
      const catalogo = copiarFixture('test-apl-1.0.0');
      modificarJson(catalogo, 'mama/aplicabilidad.json', (c) => (c.version = 'test-apl-1.0.5'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('version_mayor_que_manifiesto mama/aplicabilidad');
      expect(resultado.salida).not.toContain(catalogo);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza con version_mayor_que_manifiesto cuando un archivo de la raíz trae una versión mayor',
    () => {
      const catalogo = copiarFixture('test-apl-1.0.0');
      modificarJson(catalogo, 'atributos.json', (c) => (c.version = '2.0.0'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('version_mayor_que_manifiesto catalogo/atributos');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'valida cuando la versión del archivo es menor o igual que la del manifiesto, con o sin prefijo test-',
    () => {
      const catalogo = copiarFixture('test-apl-1.0.0');
      modificarJson(catalogo, 'mama/aplicabilidad.json', (c) => (c.version = '1.0.0'));
      modificarJson(catalogo, 'prostata/aplicabilidad.json', (c) => (c.version = 'test-apl-0.9.0'));

      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});
