import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
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

/** Fixture con el léxico real declarado en el manifiesto: la base de cada copia mal formada. */
function catalogoConMarcos() {
  const catalogo = copiarFixture('test-normalizacion-1.0.0');
  mkdirSync(path.join(catalogo, 'lenguaje'), { recursive: true });
  copyFileSync(
    path.join(CATALOGO, 'lenguaje/marcos-de-pregunta.json'),
    path.join(catalogo, 'lenguaje/marcos-de-pregunta.json'),
  );
  modificarJson(catalogo, 'manifest.json', (m) => {
    m.marcosDePregunta = true;
  });
  return catalogo;
}

const MARCOS = 'lenguaje/marcos-de-pregunta.json';

describe('catalog:validate · lenguaje/marcos-de-pregunta.json (L1D-329, [US-271 AC-8])', () => {
  it(
    'acepta el léxico real [US-271 AC-8]',
    () => {
      expect(ejecutarValidador(CATALOGO).codigo).toBe(0);
      expect(ejecutarValidador(catalogoConMarcos()).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza el idioma en ausente y nombra el campo [US-271 AC-8]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        delete c.en;
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('idioma_ausente catalogo/marcos-de-pregunta campo=en');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una entrada duplicada y nombra la lista [US-271 AC-8]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        c.es.vacias.push(c.es.vacias[0]);
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'entrada_duplicada catalogo/marcos-de-pregunta campo=es_vacias',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una entrada vacía y nombra la lista [US-271 AC-8]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        c.en.marcos.push('');
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'entrada_vacia catalogo/marcos-de-pregunta campo=en_marcos',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una entrada sin normalizar (tilde o mayúscula) [US-271 AC-8]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        c.es.marcos.push('Evidencia científica');
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'entrada_no_normalizada catalogo/marcos-de-pregunta campo=es_marcos',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una lista vacía [US-271 AC-8]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        c.es.vacias = [];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('lista_vacia catalogo/marcos-de-pregunta campo=es_vacias');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · expansion.biomarcadoresNoAnclables (L1D-331, [US-273 AC-4])', () => {
  it(
    'acepta el léxico real, que declara el PSA como no anclable en próstata [US-273 AC-4]',
    () => {
      const real = JSON.parse(
        readFileSync(path.join(CATALOGO, 'lenguaje/marcos-de-pregunta.json'), 'utf8'),
      );

      expect(real.expansion.biomarcadoresNoAnclables).toEqual({ prostata: ['psa'] });
      expect(ejecutarValidador(catalogoConMarcos()).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una lista vacía de un tipo y nombra el campo [US-273 AC-4]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        c.expansion.biomarcadoresNoAnclables.prostata = [];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'lista_vacia catalogo/marcos-de-pregunta campo=expansion_prostata',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un biomarcador no anclable que no está en datos-criticos del tipo [US-273 AC-4]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        c.expansion.biomarcadoresNoAnclables.prostata = ['psa', 'xyz'];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'biomarcador_no_anclable_desconocido catalogo/marcos-de-pregunta campo=expansion_prostata',
      );
      expect(resultado.salida).not.toContain('xyz');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una entrada duplicada y una sin normalizar [US-273 AC-4]',
    () => {
      const catalogo = catalogoConMarcos();
      modificarJson(catalogo, MARCOS, (c) => {
        c.expansion.biomarcadoresNoAnclables.prostata = ['psa', 'psa', 'Antígeno'];
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'entrada_duplicada catalogo/marcos-de-pregunta campo=expansion_prostata',
      );
      expect(resultado.salida).toContain(
        'entrada_no_normalizada catalogo/marcos-de-pregunta campo=expansion_prostata',
      );
    },
    PLAZO_PROCESO_MS,
  );
});
