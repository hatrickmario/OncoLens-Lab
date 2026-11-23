import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicosRepetidos,
  equivalentesAmbiguos,
  sinonimoIgualAlCanonico,
  violacionesDeSinonimos,
} from '../../../packages/clinical-catalogs/validator/sinonimos.mjs';
import {
  CATALOGO,
  PLAZO_PROCESO_MS,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

afterEach(limpiarCopias);

const FIXTURE = 'test-sinonimos-1.0.0';
const eq = (texto, idioma = 'es') => ({ texto, idioma, relacion: 'equivalente' });
const amplio = (texto) => ({ texto, idioma: 'es', relacion: 'mas_amplio' });
const termino = (terminoCanonico, ...sinonimos) => ({ terminoCanonico, sinonimos });

/** Edita `prostata/sinonimos.json` de una copia del fixture y corre el proceso real de `catalog:validate`. */
function validarConProstata(transformar) {
  const catalogo = copiarFixture(FIXTURE);
  modificarJson(catalogo, 'prostata/sinonimos.json', transformar);
  return { catalogo, resultado: ejecutarValidador(catalogo) };
}

describe('catalog:validate · <tipo>/sinonimos.json (L1D-335, US-277)', () => {
  it(
    'termina con código 0 cuando el manifiesto declara sinonimos con relación [US-277 AC-1]',
    () => {
      const resultado = ejecutarValidador(copiarFixture(FIXTURE));

      expect(resultado.salida).toContain('catalog:validate OK');
      expect(resultado.codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'reporta esquema_invalido cuando un sinónimo no declara relacion [US-277 AC-1]',
    () => {
      const { catalogo, resultado } = validarConProstata((c) => {
        delete c.items[0].sinonimos[0].relacion;
      });

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('esquema_invalido prostata/sinonimos');
      expect(resultado.salida).not.toContain(catalogo);
      expect(resultado.salida).not.toContain('active surveillance');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'reporta esquema_invalido cuando la relación no pertenece al conjunto cerrado [US-277 AC-1]',
    () => {
      const { resultado } = validarConProstata((c) => {
        c.items[0].sinonimos[0].relacion = 'parecido';
      });

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('esquema_invalido prostata/sinonimos');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'reporta esquema_invalido cuando revision_provisional trae un rol desconocido [US-277 AC-1]',
    () => {
      const { resultado } = validarConProstata((c) => {
        c.items[0].revision_provisional.rol = 'oncologo';
      });

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('esquema_invalido prostata/sinonimos');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'reporta sinonimo_equivalente_ambiguo cuando un texto equivale a dos términos del mismo tipo [US-277 AC-1]',
    () => {
      const { catalogo, resultado } = validarConProstata((c) => {
        c.items[0].sinonimos.push(eq('seguimiento vigilado'));
        c.items[1].sinonimos.push(eq('Seguimiento vigilado'));
      });

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('sinonimo_equivalente_ambiguo prostata/sinonimos');
      expect(resultado.salida).not.toContain(catalogo);
      expect(resultado.salida).not.toContain('seguimiento vigilado');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'acepta el mismo texto en mama y en próstata [US-277 AC-1]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      const hormonoterapia = (tipo) =>
        JSON.parse(readFileSync(path.join(catalogo, tipo, 'sinonimos.json'), 'utf8')).items.some(
          (i) =>
            i.sinonimos.some((s) => s.texto === 'hormonoterapia' && s.relacion === 'equivalente'),
        );

      expect([hormonoterapia('mama'), hormonoterapia('prostata')]).toEqual([true, true]);
      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'acepta un texto mas_amplio que también es término canónico [US-277 AC-1]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      const prostata = JSON.parse(
        readFileSync(path.join(catalogo, 'prostata/sinonimos.json'), 'utf8'),
      );
      const canonicos = prostata.items.map((i) => i.terminoCanonico);
      const ampliosCanonicos = prostata.items
        .flatMap((i) => i.sinonimos)
        .filter((s) => s.relacion === 'mas_amplio' && canonicos.includes(s.texto));

      expect(ampliosCanonicos).toHaveLength(1);
      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'no valida sinonimos.json y sigue válido un catálogo cuyo manifiesto no declara sinonimos [US-277 AC-1]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      modificarJson(catalogo, 'manifest.json', (m) => delete m.sinonimos);
      modificarJson(catalogo, 'prostata/sinonimos.json', (c) => {
        delete c.items[0].sinonimos[0].relacion;
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.salida).toContain('catalog:validate OK');
      expect(resultado.codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'no exige terminos-prohibidos cuando el manifiesto solo declara sinonimos [US-277 AC-1]',
    () => {
      const catalogo = copiarFixture(FIXTURE);

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.salida).not.toContain('archivo_ilegible');
      expect(resultado.codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});

describe('reglas puras de sinonimos.json', () => {
  it('equivalentesAmbiguos detecta un texto equivalente de dos términos y un canónico que es equivalente de otro', () => {
    const dosTerminos = [termino('a', eq('x')), termino('b', eq('X'))];
    const canonicoYEquivalente = [termino('a', eq('b')), termino('b', eq('c'))];

    expect(equivalentesAmbiguos(dosTerminos)).toBe(true);
    expect(equivalentesAmbiguos(canonicoYEquivalente)).toBe(true);
  });

  it('equivalentesAmbiguos ignora un texto no equivalente repetido o también canónico', () => {
    const items = [termino('a', amplio('b'), eq('x')), termino('b', amplio('x'))];

    expect(equivalentesAmbiguos(items)).toBe(false);
  });

  it('equivalentesAmbiguos compara sin tildes ni mayúsculas', () => {
    const items = [termino('a', eq('prostatectomía')), termino('b', eq('PROSTATECTOMIA'))];

    expect(equivalentesAmbiguos(items)).toBe(true);
  });

  it('canonicosRepetidos detecta el mismo término canónico dos veces', () => {
    expect(canonicosRepetidos([termino('a', eq('x')), termino('A', eq('y'))])).toBe(true);
    expect(canonicosRepetidos([termino('a', eq('x')), termino('b', eq('y'))])).toBe(false);
  });

  it('sinonimoIgualAlCanonico detecta un sinónimo con el texto de su propio canónico', () => {
    expect(sinonimoIgualAlCanonico([termino('a', eq('A'))])).toBe(true);
    expect(sinonimoIgualAlCanonico([termino('a', eq('b'))])).toBe(false);
  });

  it('sinonimoIgualAlCanonico acepta la grafía de otro idioma que solo difiere en la tilde', () => {
    const items = [termino('trastuzumab deruxtecán', eq('trastuzumab deruxtecan', 'en'))];

    expect(sinonimoIgualAlCanonico(items)).toBe(false);
  });

  it('violacionesDeSinonimos nombra el código y el archivo, sin valores del catálogo', () => {
    const archivo = {
      items: [termino('a', eq('x')), termino('b', eq('x')), termino('b', eq('b'))],
    };

    expect(violacionesDeSinonimos(archivo)).toEqual([
      { codigo: 'sinonimo_equivalente_ambiguo', archivo: 'sinonimos' },
      { codigo: 'termino_canonico_repetido', archivo: 'sinonimos' },
      { codigo: 'sinonimo_igual_al_canonico', archivo: 'sinonimos' },
    ]);
  });

  it('violacionesDeSinonimos no reporta nada cuando el archivo no tiene la forma de items', () => {
    expect(violacionesDeSinonimos({})).toEqual([]);
    expect(violacionesDeSinonimos(null)).toEqual([]);
  });
});

describe('esquema de sinonimos', () => {
  it('el enum de relacion del esquema contiene equivalente, mas_amplio y miembro_de_clase [US-277 AC-1]', () => {
    const esquema = JSON.parse(
      readFileSync(path.join(CATALOGO, 'schemas/sinonimos.schema.json'), 'utf8'),
    );
    const relacion = esquema.properties.items.items.properties.sinonimos.items.properties.relacion;

    expect([...relacion.enum].sort()).toEqual(['equivalente', 'mas_amplio', 'miembro_de_clase']);
  });
});
