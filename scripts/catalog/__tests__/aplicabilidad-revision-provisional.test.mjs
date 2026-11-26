import { afterEach, describe, expect, it } from 'vitest';
import {
  PLAZO_PROCESO_MS,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

afterEach(limpiarCopias);

/**
 * S7.5 (US-121, design D9, D10, D11): `revision_provisional` por criterio, `rule.subsetOf` y `rule.equivalenceMatch`
 * en `aplicabilidad.json`. Una copia válida de FX-08b-a con un criterio alterado; la copia sin alterar valida antes.
 */
const VERSION = 'test-apl-1.0.0';
const ARCHIVO = 'mama/aplicabilidad.json';
const criterioDe = (contenido, clave) => contenido.items.find((item) => item.key === clave);

function copiaAlterada(alterar) {
  const catalogo = copiarFixture(VERSION);
  expect(ejecutarValidador(catalogo).codigo, 'la copia sin alterar debe validar').toBe(0);
  modificarJson(catalogo, ARCHIVO, alterar);
  return catalogo;
}

const conMarca = (rol, fecha) => (contenido) => {
  criterioDe(contenido, 'estado_menopausico').revision_provisional = { rol, fecha };
};

const conSubconjunto = (subsetOf) => (contenido) => {
  const regla = criterioDe(contenido, 'estado_her2').rule;
  regla.equivalences = { positivo: ['3+'], bajo: ['1+'], negativo: ['0'] };
  regla.subsetOf = subsetOf;
};

describe('catalog:validate · revision_provisional de un criterio de aplicabilidad (S7.5)', () => {
  it(
    'valida con código 0 cuando un criterio lleva revision_provisional con rol ia y fecha ISO [US-121 AC-1]',
    () => {
      const catalogo = copiaAlterada(conMarca('ia', '2026-11-21'));

      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 y nombra el criterio y el campo cuando revision_provisional trae un rol desconocido [US-121 AC-1]',
    () => {
      const catalogo = copiaAlterada(conMarca('oncologo', '2026-11-21'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('revision_provisional_invalida mama/estado_menopausico');
      expect(resultado.salida).toContain('campo=rol');
      expect(resultado.salida).not.toContain('oncologo');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 y nombra el campo fecha cuando revision_provisional trae una fecha que no es ISO [US-121 AC-1]',
    () => {
      const catalogo = copiaAlterada(conMarca('ia', '21/11/2026'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('revision_provisional_invalida mama/estado_menopausico');
      expect(resultado.salida).toContain('campo=fecha');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · rule.subsetOf de un criterio de aplicabilidad (S7.5, D11)', () => {
  it(
    'valida con código 0 cuando subsetOf nombra categorías declaradas en equivalences [US-121 AC-5]',
    () => {
      const catalogo = copiaAlterada(conSubconjunto({ bajo: 'negativo' }));

      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 y nombra el criterio cuando subsetOf nombra una categoría que no está en equivalences [US-121 AC-5]',
    () => {
      const catalogo = copiaAlterada(conSubconjunto({ bajo: 'inexistente' }));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('subconjunto_sin_equivalencia mama/estado_her2');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 cuando una categoría es subconjunto de sí misma [US-121 AC-5]',
    () => {
      const catalogo = copiaAlterada(conSubconjunto({ bajo: 'bajo' }));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('subconjunto_sin_equivalencia mama/estado_her2');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · subsetOf sin ciclos (S7.5, D11)', () => {
  it(
    'termina con código distinto de 0 cuando subsetOf forma un ciclo entre categorías [US-121 AC-5]',
    () => {
      const catalogo = copiaAlterada(conSubconjunto({ bajo: 'negativo', negativo: 'bajo' }));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('subconjunto_sin_equivalencia mama/estado_her2');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · rule.equivalenceMatch de un criterio de aplicabilidad (S7.5, D10)', () => {
  const conLectura = (modo) => (contenido) => {
    const regla = criterioDe(contenido, 'estadio').rule;
    regla.equivalences = { no_metastasica: ['M0'], metastasica: ['M1'] };
    regla.equivalenceMatch = modo;
  };

  it(
    'valida con código 0 cuando equivalenceMatch es componente [US-121 AC-5]',
    () => {
      const catalogo = copiaAlterada(conLectura('componente'));

      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 cuando equivalenceMatch trae un modo desconocido [US-121 AC-5]',
    () => {
      const catalogo = copiaAlterada(conLectura('regex'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('esquema_invalido mama/aplicabilidad');
    },
    PLAZO_PROCESO_MS,
  );
});
