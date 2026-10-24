import { afterEach, describe, expect, it } from 'vitest';
import {
  PLAZO_PROCESO_MS,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

afterEach(limpiarCopias);

const VERSION = 'test-apl-1.0.0';
const ARCHIVO = 'mama/aplicabilidad.json';
const criterioDe = (contenido, clave) => contenido.items.find((item) => item.key === clave);

/** Copia válida de FX-08b-a con un criterio alterado; comprueba antes que la copia sin alterar valida. */
function copiaRota(alterar) {
  const catalogo = copiarFixture(VERSION);
  expect(ejecutarValidador(catalogo).codigo, 'la copia sin alterar debe validar').toBe(0);
  modificarJson(catalogo, ARCHIVO, alterar);
  return catalogo;
}

describe('catalog:validate · destino de los criterios de aplicabilidad (FX-08b-a)', () => {
  it(
    'termina con código distinto de 0 y nombra estado_menopausico cuando un criterio de aplicabilidad no tiene destination [US-121 AC-2]',
    () => {
      const catalogo = copiaRota((c) => delete criterioDe(c, 'estado_menopausico').destination);

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('destino_ausente mama/estado_menopausico');
      expect(resultado.salida).not.toContain(catalogo);
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · sin puntaje en criterios de aplicabilidad (RN-28)', () => {
  it.each(['peso', 'score', 'weight'])(
    'termina con código distinto de 0 y nombra ecog y el campo cuando un criterio declara %s [US-121 AC-3]',
    (campo) => {
      const catalogo = copiaRota((c) => (criterioDe(c, 'ecog')[campo] = 1));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(`campo_de_puntaje mama/ecog campo=${campo}`);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'nombra el campo cuando el puntaje está anidado en rule y escrito con otras mayúsculas [US-121 AC-3]',
    () => {
      const catalogo = copiaRota((c) => (criterioDe(c, 'ecog').rule.partial.Weight = 2));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('campo_de_puntaje mama/ecog campo=weight');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · studyKey de los criterios de aplicabilidad', () => {
  it(
    'termina con código distinto de 0 con study_key_ausente y nombra ecog cuando falta studyKey [US-121 AC-1]',
    () => {
      const catalogo = copiaRota((c) => delete criterioDe(c, 'ecog').studyKey);

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('study_key_ausente mama/ecog');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 con study_key_inexistente y nombra ecog cuando studyKey no es clave de población [US-121 AC-1]',
    () => {
      const catalogo = copiaRota((c) => (criterioDe(c, 'ecog').studyKey = 'ecog_x'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('study_key_inexistente mama/ecog');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 con study_key_duplicada y nombra estadio y ecog cuando comparten studyKey [US-121 AC-1]',
    () => {
      const catalogo = copiaRota((c) => (criterioDe(c, 'ecog').studyKey = 'estadio'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('study_key_duplicada mama/estadio');
      expect(resultado.salida).toContain('study_key_duplicada mama/ecog');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 con study_key_inexistente cuando la clave solo se declara para otro tipo de cáncer [US-121 AC-1]',
    () => {
      const catalogo = copiaRota((c) => (criterioDe(c, 'ecog').studyKey = 'estado_castracion'));
      modificarJson(catalogo, 'poblacion.json', (p) =>
        p.keys.push({ key: 'estado_castracion', cancerTypes: ['prostata'] }),
      );

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('study_key_inexistente mama/ecog');
    },
    PLAZO_PROCESO_MS,
  );
});
