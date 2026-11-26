import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogHashDeReglasDePoblacion } from '../../../packages/clinical-catalogs/validator/index.mjs';
import { hashDelArchivo } from '../hash.mjs';
import { CATALOGO, PLAZO_PROCESO_MS, VERSION_DEL_CATALOGO, ejecutarValidador } from './apoyo.mjs';

/**
 * Contenido del catálogo tras la revisión clínica provisional del S7 (l1d-126 parte B, US-121, design D9…D14,
 * `[S7 resp. 1]`, `[S7 resp. 9]`): C-1 (extension), C-2 (HER2 bajo), C-4 (triple negativo) y C-5 (HRR/BRCA).
 */
const leerJson = (ruta) => JSON.parse(readFileSync(path.join(CATALOGO, ruta), 'utf8'));
const criterioDe = (tipo, clave) =>
  leerJson(`${tipo}/aplicabilidad.json`).items.find((item) => item.key === clave);
const poblacionDe = (tipo, clave) => leerJson(`${tipo}/poblacion-reglas.json`).criteria[clave];
const sinonimosDe = (tipo, clave) => poblacionDe(tipo, clave)?.synonyms ?? {};

const MARCA = { rol: 'ia', fecha: '2026-11-21' };

/** Huellas del contenido que el asesor sí revisó (S3, 2026-10-24): las de `validation.catalogHash` antes de la parte B. */
const HUELLA_DEL_ASESOR = {
  mama: 'c89a3335f17f3141dcecbed4d8fd5875614736f27e2e8f66bc8a9621db0498b4',
  prostata: 'c5e248cd58e9a8ad920472ffeba4389a4ab0a77308b6aaf2950e089f0bc638ed',
};

/** Cada texto es sinónimo de un solo código (el índice de sinónimos del consumidor no admite ambigüedad). */
const textosRepetidosEntreCodigos = (sinonimos) => {
  const todos = Object.values(sinonimos).flatMap((textos) => textos.map((t) => t.toLowerCase()));
  return todos.filter((texto, indice) => todos.indexOf(texto) !== indice);
};

describe('catálogo del S7 · marca de revisión provisional (D9)', () => {
  it.each([
    ['mama', 'estado_her2'],
    ['prostata', 'extension'],
    ['prostata', 'hrr_brca'],
  ])(
    'marca %s/%s con revision_provisional de la IA y lo deja en estado propuesta [US-121 AC-1]',
    (tipo, clave) => {
      const criterio = criterioDe(tipo, clave);

      expect(criterio.revision_provisional).toEqual(MARCA);
      expect(criterio.estado).toBe('propuesta');
    },
  );

  it.each([
    ['mama', 'estado_her2'],
    ['mama', 'receptores_hormonales'],
    ['prostata', 'extension'],
    ['prostata', 'hrr_brca'],
    ['prostata', 'estado_castracion'],
  ])(
    'marca el bloque de poblacion-reglas de %s/%s con revision_provisional de la IA [US-121 AC-1]',
    (tipo, clave) => {
      expect(poblacionDe(tipo, clave)?.revision_provisional).toEqual(MARCA);
    },
  );

  it(
    'valida con código 0 y ningún criterio pasa a revisado [US-121 AC-1]',
    () => {
      for (const tipo of ['mama', 'prostata']) {
        for (const criterio of leerJson(`${tipo}/aplicabilidad.json`).items) {
          expect(criterio.estado, `${tipo}/${criterio.key}`).toBe('propuesta');
        }
      }
      expect(ejecutarValidador(CATALOGO).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catálogo del S7 · bloque validation provisional con historial (D14, [S7 resp. 9])', () => {
  it.each(['mama', 'prostata'])(
    'declara %s/aplicabilidad como revisión provisional de la IA con la huella del contenido nuevo [US-121 AC-1]',
    (tipo) => {
      const { validation } = leerJson(`${tipo}/aplicabilidad.json`);

      expect(validation).toMatchObject({
        scope: ['aplicabilidad'],
        status: 'revision_provisional',
        reviewerRole: 'ia',
        date: '2026-11-21',
      });
      expect(validation.catalogHash).toBe(
        hashDelArchivo(CATALOGO, `${tipo}/aplicabilidad.json`, ['aplicabilidad']),
      );
    },
  );

  it.each(['mama', 'prostata'])(
    'conserva la revisión del asesor del S3 de %s en el historial con la huella de entonces [US-121 AC-1]',
    (tipo) => {
      const { validation } = leerJson(`${tipo}/aplicabilidad.json`);

      expect(validation.history).toEqual([
        {
          status: 'propuesta_revisada',
          reviewerRole: 'oncologo_asesor',
          date: '2026-10-24',
          catalogHash: HUELLA_DEL_ASESOR[tipo],
        },
      ]);
      expect(validation.catalogHash).not.toBe(HUELLA_DEL_ASESOR[tipo]);
    },
  );

  it('no atribuye a un oncólogo ninguna huella del contenido editado por la IA [US-121 AC-1]', () => {
    for (const tipo of ['mama', 'prostata']) {
      const { validation } = leerJson(`${tipo}/aplicabilidad.json`);
      const conRolDeOncologo = [validation, ...(validation.history ?? [])].filter(
        (bloque) => bloque.reviewerRole !== 'ia',
      );

      expect(
        conRolDeOncologo.map((bloque) => bloque.catalogHash),
        tipo,
      ).not.toContain(validation.catalogHash);
    }
  });
});

describe('catálogo del S7 · C-1: extensión excluyente en próstata (D10)', () => {
  it('declara extension excluyente con dos códigos leídos del componente M del estadio [US-121 AC-1]', () => {
    const { isExclusionary, rule } = criterioDe('prostata', 'extension');

    expect(isExclusionary).toBe(true);
    expect(rule.equivalences).toEqual({ no_metastasica: ['M0'], metastasica: ['M1'] });
    expect(rule.equivalenceMatch).toBe('componente');
  });

  it('mantiene las seis claves de próstata del S3 [US-121 AC-1]', () => {
    const claves = leerJson('prostata/aplicabilidad.json')
      .items.map((item) => item.key)
      .sort();

    expect(claves).toEqual(
      ['estado_castracion', 'extension', 'isup', 'linea_tratamiento', 'ecog', 'hrr_brca'].sort(),
    );
  });

  it('trae sinónimos en español y en inglés para los dos códigos de extension [US-121 AC-1]', () => {
    const sinonimos = sinonimosDe('prostata', 'extension');

    expect(Object.keys(sinonimos).sort()).toEqual(['metastasica', 'no_metastasica']);
    expect(sinonimos.metastasica).toEqual(
      expect.arrayContaining(['metastatic prostate cancer', 'enfermedad metastásica']),
    );
    expect(sinonimos.no_metastasica).toEqual(
      expect.arrayContaining(['localized prostate cancer', 'enfermedad localizada']),
    );
    expect(textosRepetidosEntreCodigos(sinonimos)).toEqual([]);
  });

  it('trae sinónimos de estado_castracion con los valores del atributo como códigos [US-121 AC-1]', () => {
    const sinonimos = sinonimosDe('prostata', 'estado_castracion');

    expect(sinonimos.resistente_castracion).toEqual(
      expect.arrayContaining(['resistente_castracion', 'castration-resistant']),
    );
    expect(sinonimos.sensible_castracion).toEqual(
      expect.arrayContaining(['sensible_castracion', 'castration-sensitive']),
    );
    expect(textosRepetidosEntreCodigos(sinonimos)).toEqual([]);
  });
});

describe('catálogo del S7 · C-2: HER2 bajo subconjunto de negativo (D11)', () => {
  it('declara positivo, bajo y negativo con bajo dentro de negativo [US-121 AC-1]', () => {
    const { rule } = criterioDe('mama', 'estado_her2');

    expect(rule.equivalences).toEqual({
      positivo: ['3+', '2+ con ISH positivo'],
      bajo: ['1+', '2+ con ISH negativo'],
      negativo: ['0'],
    });
    expect(rule.subsetOf).toEqual({ bajo: 'negativo' });
  });

  it('mantiene HER2 excluyente y no declara el 2+ sin ISH en ninguna categoría [US-121 AC-1]', () => {
    const { isExclusionary, rule } = criterioDe('mama', 'estado_her2');
    const alternativas = Object.values(rule.equivalences).flat();

    expect(isExclusionary).toBe(true);
    expect(alternativas).not.toContain('2+');
  });

  it('trae sinónimos en español y en inglés del código bajo [US-121 AC-1]', () => {
    const { bajo } = sinonimosDe('mama', 'estado_her2');

    expect(bajo).toEqual(expect.arrayContaining(['HER2-low', 'HER2 bajo']));
  });
});

describe('catálogo del S7 · C-4: triple negativo proyectado en dos criterios (D12)', () => {
  it('no lista triple_negativo como código de receptores_hormonales [US-121 AC-1]', () => {
    expect(Object.keys(sinonimosDe('mama', 'receptores_hormonales'))).not.toContain(
      'triple_negativo',
    );
  });

  it.each(['estado_her2', 'receptores_hormonales'])(
    'trae los textos de triple negativo en español y en inglés como sinónimos de negativo en %s [US-121 AC-1]',
    (clave) => {
      expect(sinonimosDe('mama', clave).negativo).toEqual(
        expect.arrayContaining(['triple-negative (TNBC)', 'triple negativo']),
      );
    },
  );
});

describe('catálogo del S7 · C-5: HRR/BRCA con cuatro valores (D13)', () => {
  const CODIGOS = ['brca12_mutado', 'no_evaluado', 'otro_gen_hrr', 'sin_mutacion'];

  it('declara exactamente cuatro códigos en equivalences y en los sinónimos [US-121 AC-1]', () => {
    const { rule } = criterioDe('prostata', 'hrr_brca');

    expect(Object.keys(rule.equivalences ?? {}).sort()).toEqual(CODIGOS);
    expect(Object.keys(sinonimosDe('prostata', 'hrr_brca')).sort()).toEqual(CODIGOS);
  });

  it('no asigna a BRCA1/2 y a otro gen HRR el mismo texto ni el mismo código [US-121 AC-1]', () => {
    const sinonimos = sinonimosDe('prostata', 'hrr_brca');

    expect(textosRepetidosEntreCodigos(sinonimos)).toEqual([]);
    expect(sinonimos.brca12_mutado).toEqual(
      expect.arrayContaining(['BRCA1/2 mutado', 'BRCA1/2 mutated']),
    );
    expect(sinonimos.otro_gen_hrr).toEqual(
      expect.arrayContaining(['otro gen HRR mutado', 'other HRR gene mutated']),
    );
  });
});

describe('catálogo del S7 · versión y huellas (D14)', () => {
  it('declara en cada archivo tocado la misma versión que manifest.version, sin fijar el literal [US-121 AC-4]', () => {
    const manifiesto = leerJson('manifest.json');
    const versiones = ['mama', 'prostata'].flatMap((tipo) => [
      leerJson(`${tipo}/aplicabilidad.json`).version,
      leerJson(`${tipo}/poblacion-reglas.json`).version,
    ]);

    expect(manifiesto.version).toBe(VERSION_DEL_CATALOGO);
    expect(versiones).toEqual(Array(4).fill(manifiesto.version));
  });

  it.each(['mama', 'prostata'])(
    'recalcula la huella de poblacion-reglas de %s en el manifiesto [US-121 AC-4]',
    (tipo) => {
      expect(leerJson('manifest.json').poblacionReglas[tipo].catalogHash).toBe(
        catalogHashDeReglasDePoblacion(leerJson(`${tipo}/poblacion-reglas.json`)),
      );
    },
  );
});
