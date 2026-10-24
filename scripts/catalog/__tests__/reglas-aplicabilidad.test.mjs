import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVOS_DE_RAIZ,
  ARCHIVOS_DEL_CATALOGO,
  leerCatalogo,
  leerEsquemas,
  mensajeDe,
  validarCatalogo,
} from '../../../packages/clinical-catalogs/validator/index.mjs';
import {
  clavesRepetidasEn,
  exigirAtributoDeclarado,
  exigirDestinoExistente,
  exigirStudyKey,
  rechazarCamposDePuntaje,
} from '../../../packages/clinical-catalogs/validator/reglas.mjs';
import { CATALOGO, FIXTURES } from './apoyo.mjs';

const leerTexto = (ruta) => readFileSync(ruta, 'utf8');
const esquemas = leerEsquemas(path.join(CATALOGO, 'schemas'), leerTexto);
const allowlist = JSON.parse(leerTexto(path.join(CATALOGO, 'validator/modelo.allowlist.json')));
const poblacion = {
  keys: [
    { key: 'ecog', cancerTypes: ['mama', 'prostata'] },
    { key: 'biomarcadores.her2', cancerTypes: ['mama'] },
  ],
};
const ninguna = new Set();

describe('rechazarCamposDePuntaje', () => {
  it('devuelve null cuando el criterio no declara puntaje', () => {
    expect(rechazarCamposDePuntaje({ key: 'ecog', rule: { operator: 'rango' } })).toBeNull();
  });

  it.each(['peso', 'score', 'weight'])(
    'devuelve el campo %s cuando está en el primer nivel',
    (campo) => {
      expect(rechazarCamposDePuntaje({ key: 'ecog', [campo]: 1 })).toEqual({
        codigo: 'campo_de_puntaje',
        campo,
      });
    },
  );

  it('devuelve el campo en minúsculas cuando está anidado en un objeto con otras mayúsculas', () => {
    expect(rechazarCamposDePuntaje({ rule: { partial: { Weight: 2 } } })).toEqual({
      codigo: 'campo_de_puntaje',
      campo: 'weight',
    });
  });

  it('devuelve el campo cuando está dentro de un arreglo', () => {
    expect(rechazarCamposDePuntaje({ rule: { opciones: [{ a: 1 }, { score: 3 }] } })).toEqual({
      codigo: 'campo_de_puntaje',
      campo: 'score',
    });
  });

  it('no confunde un valor llamado peso con un campo de puntaje', () => {
    expect(rechazarCamposDePuntaje({ label: { es: 'peso' }, destination: {} })).toBeNull();
  });

  it('devuelve null cuando el ítem no es un objeto', () => {
    expect(rechazarCamposDePuntaje(null)).toBeNull();
  });
});

describe('exigirStudyKey', () => {
  it('devuelve null cuando la clave está declarada para el tipo y no se repite', () => {
    expect(exigirStudyKey({ studyKey: 'ecog' }, 'mama', poblacion, ninguna)).toBeNull();
  });

  it('acepta una subclave con punto declarada en la población', () => {
    expect(
      exigirStudyKey({ studyKey: 'biomarcadores.her2' }, 'mama', poblacion, ninguna),
    ).toBeNull();
  });

  it.each([undefined, '', 7, null])('devuelve study_key_ausente cuando studyKey es %j', (valor) => {
    expect(exigirStudyKey({ studyKey: valor }, 'mama', poblacion, ninguna)).toBe(
      'study_key_ausente',
    );
  });

  it('devuelve study_key_inexistente cuando la clave no está en la población', () => {
    expect(exigirStudyKey({ studyKey: 'ecog_x' }, 'mama', poblacion, ninguna)).toBe(
      'study_key_inexistente',
    );
  });

  it('devuelve study_key_inexistente cuando la clave solo se declara para otro tipo de cáncer', () => {
    expect(exigirStudyKey({ studyKey: 'biomarcadores.her2' }, 'prostata', poblacion, ninguna)).toBe(
      'study_key_inexistente',
    );
  });

  it('devuelve study_key_duplicada cuando otro criterio del archivo la repite', () => {
    expect(exigirStudyKey({ studyKey: 'ecog' }, 'mama', poblacion, new Set(['ecog']))).toBe(
      'study_key_duplicada',
    );
  });

  it('tolera entradas de población que no son objetos', () => {
    const deformada = { keys: [null, 'x', { key: 'ecog', cancerTypes: 'mama' }] };

    expect(exigirStudyKey({ studyKey: 'ecog' }, 'mama', deformada, ninguna)).toBe(
      'study_key_inexistente',
    );
  });
});

describe('clavesRepetidasEn', () => {
  it('devuelve los valores repetidos del campo indicado', () => {
    const items = [{ studyKey: 'a' }, { studyKey: 'b' }, { studyKey: 'a' }];

    expect([...clavesRepetidasEn(items, 'studyKey')]).toEqual(['a']);
  });
});

describe('mensajeDe', () => {
  it('añade el campo cuando la violación lo trae', () => {
    expect(
      mensajeDe({
        codigo: 'campo_de_puntaje',
        tipoDeCancer: 'mama',
        elemento: 'ecog',
        campo: 'peso',
      }),
    ).toBe('campo_de_puntaje mama/ecog campo=peso');
  });

  it('sustituye por ? un campo que no tiene forma de clave del catálogo', () => {
    expect(
      mensajeDe({ codigo: 'x', tipoDeCancer: 'mama', elemento: 'ecog', campo: 'Paciente Juan' }),
    ).toBe('x mama/ecog campo=?');
  });
});

describe('destination.match con listas', () => {
  const conLista = (match) => ({ destination: { entity: 'Biomarker', field: 'value', match } });

  it('acepta una lista como valor cuando la clave de match existe', () => {
    expect(exigirDestinoExistente(conLista({ name: ['RE', 'RP'] }), allowlist)).toBeNull();
  });

  it('rechaza con destino_inexistente cuando la clave del match con lista no existe', () => {
    expect(exigirDestinoExistente(conLista({ nombre_x: ['RE', 'RP'] }), allowlist)).toBe(
      'destino_inexistente',
    );
  });

  it.each([
    ['una lista vacía', []],
    ['una lista con repetidos', ['RE', 'RE']],
    ['una lista de números', [1]],
    ['un número', 3],
  ])('rechaza con esquema_invalido un match con %s', (_nombre, valor) => {
    const archivos = leerCatalogo(path.join(FIXTURES, 'test-apl-1.0.0'), leerTexto);
    archivos.tipos.mama.aplicabilidad.items[0].destination.match = { name: valor };

    const { violaciones } = validarCatalogo({ archivos, allowlist, esquemas });

    expect(violaciones).toEqual([
      { codigo: 'esquema_invalido', tipoDeCancer: 'mama', archivo: 'aplicabilidad' },
    ]);
  });

  it.each(['test-1.0.0', 'test-1.1.0', 'test-apl-1.0.0', 'test-apl-1.0.1'])(
    'mantiene válido el catálogo %s',
    (version) => {
      const archivos = leerCatalogo(path.join(FIXTURES, version), leerTexto);

      expect(validarCatalogo({ archivos, allowlist, esquemas }).violaciones).toEqual([]);
    },
  );
});

describe('match con lista solo en aplicabilidad (Gate 2 vuelta 1, punto 1)', () => {
  const cargar = () => leerCatalogo(path.join(FIXTURES, 'test-apl-1.0.0'), leerTexto);
  const declaradas = { keys: [{ key: 'estado_menopausico', cancerTypes: ['mama'] }] };
  const atributo = (clave) => ({
    destination: { entity: 'ClinicalAttribute', field: 'value', match: { attribute_key: clave } },
  });

  it('rechaza con esquema_invalido un ítem de datos críticos cuyo match trae una lista', () => {
    const archivos = cargar();
    archivos.tipos.mama['datos-criticos'].items[0].destination = {
      entity: 'Biomarker',
      field: 'value',
      match: { name: ['RE', 'RP'] },
    };

    const { violaciones } = validarCatalogo({ archivos, allowlist, esquemas });

    expect(violaciones).toEqual([
      { codigo: 'esquema_invalido', tipoDeCancer: 'mama', archivo: 'datos-criticos' },
    ]);
  });

  it('acepta un criterio de aplicabilidad cuyo match trae una lista', () => {
    const archivos = cargar();
    archivos.tipos.mama.aplicabilidad.items[0].destination.match = { name: ['RE', 'RP'] };

    expect(validarCatalogo({ archivos, allowlist, esquemas }).violaciones).toEqual([]);
  });

  it('devuelve null cuando todas las attribute_key de la lista están declaradas', () => {
    expect(
      exigirAtributoDeclarado(atributo(['estado_menopausico']), 'mama', declaradas),
    ).toBeNull();
  });

  it('devuelve atributo_no_declarado cuando alguna attribute_key de la lista no está declarada', () => {
    expect(
      exigirAtributoDeclarado(atributo(['estado_menopausico', 'menopausia_x']), 'mama', declaradas),
    ).toBe('atributo_no_declarado');
  });
});

describe('contexto propio de cada archivo del registro (Gate 2 vuelta 1, punto 3)', () => {
  it('entrega a las reglas el contexto que declara su entrada del registro, derivado de los ítems', () => {
    const entrada = ARCHIVOS_DEL_CATALOGO.aplicabilidad;
    const original = { reglas: entrada.reglas, contexto: entrada.contexto };
    entrada.contexto = (items) => ({ sonda: items.length });
    entrada.reglas = [(_item, contexto) => (contexto.sonda === 6 ? 'sonda_recibida' : null)];
    try {
      const archivos = leerCatalogo(path.join(FIXTURES, 'test-apl-1.0.0'), leerTexto);
      archivos.tipos.mama.aplicabilidad.items = archivos.tipos.mama.aplicabilidad.items.slice(0, 5);
      archivos.tipos.mama.aplicabilidad.items.push({
        ...archivos.tipos.mama.aplicabilidad.items[0],
        key: 'otro',
      });

      const { violaciones } = validarCatalogo({ archivos, allowlist, esquemas });

      expect(violaciones.map((violacion) => violacion.codigo)).toContain('sonda_recibida');
    } finally {
      Object.assign(entrada, original);
    }
  });
});

describe('registro de archivos de raíz (Gate 2 vuelta 1, punto 4)', () => {
  const esquemaFicticio = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: ['version'],
    properties: { version: { type: 'string' } },
  };
  const lector = (ruta) =>
    ruta.endsWith('ficticio.schema.json')
      ? JSON.stringify(esquemaFicticio)
      : ruta.endsWith('/ficticio.json')
        ? JSON.stringify({ version: '1', extra: true })
        : leerTexto(ruta);

  it('lee, compila y valida un archivo de raíz añadido al registro', () => {
    ARCHIVOS_DE_RAIZ.ficticio = { esquema: 'ficticio' };
    try {
      const directorio = path.join(FIXTURES, 'test-apl-1.0.0');
      const archivos = leerCatalogo(directorio, lector);
      const esquemasConFicticio = leerEsquemas(path.join(CATALOGO, 'schemas'), lector);

      const { violaciones } = validarCatalogo({
        archivos,
        allowlist,
        esquemas: esquemasConFicticio,
      });

      expect(archivos.ficticio).toEqual({ version: '1', extra: true });
      expect(violaciones).toEqual([{ codigo: 'esquema_invalido', archivo: 'ficticio' }]);
    } finally {
      delete ARCHIVOS_DE_RAIZ.ficticio;
    }
  });
});

describe('poblacion.json deformado', () => {
  const validarConPoblacion = (poblacionDeformada) => {
    const archivos = leerCatalogo(path.join(FIXTURES, 'test-apl-1.0.0'), leerTexto);
    archivos.poblacion = poblacionDeformada;
    let resultado;
    expect(() => {
      resultado = validarCatalogo({ archivos, allowlist, esquemas });
    }).not.toThrow();
    return resultado;
  };

  it.each([
    ['nulo', null],
    ['sin keys', { version: 'test-apl-1.0.0' }],
    ['con entradas que no son objetos', { version: 'test-apl-1.0.0', keys: [null, 'x'] }],
  ])('informa esquema_invalido de poblacion y study_key_inexistente cuando es %s', (_n, valor) => {
    const codigos = validarConPoblacion(valor).violaciones.map(({ codigo, archivo }) => [
      codigo,
      archivo,
    ]);

    expect(codigos).toContainEqual(['esquema_invalido', 'poblacion']);
    expect(codigos).toContainEqual(['study_key_inexistente', undefined]);
  });
});
