import { afterEach, describe, expect, it } from 'vitest';
import { catalogHashDe } from '../../../packages/clinical-catalogs/validator/index.mjs';
import {
  PLAZO_PROCESO_MS,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

afterEach(limpiarCopias);

/**
 * S7.5b (US-121, design D14, `[S7 resp. 9]`): el bloque `validation` de un `aplicabilidad.json` editado por la IA
 * declara la revisión provisional y conserva la del asesor como `history`. Dos reglas con nombre del validador.
 */
const VERSION = 'test-apl-1.0.0';
const ARCHIVO = 'mama/aplicabilidad.json';
const HUELLA_DEL_ASESOR = 'a'.repeat(64);

const bloquePrincipal = (items) => ({
  scope: ['aplicabilidad'],
  status: 'revision_provisional',
  reviewerRole: 'ia',
  date: '2026-11-21',
  catalogHash: catalogHashDe(['aplicabilidad'], items),
});

const entradaDelAsesor = (catalogHash = HUELLA_DEL_ASESOR) => ({
  status: 'propuesta_revisada',
  reviewerRole: 'oncologo_asesor',
  date: '2026-10-24',
  catalogHash,
});

/** Copia de FX-08b-a con un bloque `validation` construido sobre sus criterios y alterado por `alterar`. */
function copiaConBloque(alterar = () => {}) {
  const catalogo = copiarFixture(VERSION);
  modificarJson(catalogo, ARCHIVO, (contenido) => {
    const bloque = { ...bloquePrincipal(contenido.items), history: [entradaDelAsesor()] };
    alterar(bloque);
    contenido.validation = bloque;
  });
  return catalogo;
}

describe('catalog:validate · bloque validation de la revisión provisional (S7.5b)', () => {
  it(
    'valida con código 0 cuando el bloque es de revisión provisional de la IA y conserva la revisión del asesor en el historial [US-121 AC-1]',
    () => {
      const catalogo = copiaConBloque();

      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 cuando una revisión provisional declara un rol que no es ia [US-121 AC-1]',
    () => {
      const catalogo = copiaConBloque((bloque) => {
        bloque.reviewerRole = 'oncologo_asesor';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('validacion_provisional_incoherente mama/aplicabilidad');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 cuando el rol ia acompaña a un estado que no es de revisión provisional [US-121 AC-1]',
    () => {
      const catalogo = copiaConBloque((bloque) => {
        bloque.status = 'propuesta_revisada';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('validacion_provisional_incoherente mama/aplicabilidad');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 cuando el historial lleva la huella vigente [US-121 AC-1]',
    () => {
      const catalogo = copiaConBloque((bloque) => {
        bloque.history = [entradaDelAsesor(bloque.catalogHash)];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('historial_con_huella_vigente mama/aplicabilidad');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'termina con código distinto de 0 cuando una entrada del historial trae campos fuera del esquema [US-121 AC-1]',
    () => {
      const catalogo = copiaConBloque((bloque) => {
        bloque.history[0].nombre = 'persona';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('esquema_invalido mama/aplicabilidad');
    },
    PLAZO_PROCESO_MS,
  );
});
