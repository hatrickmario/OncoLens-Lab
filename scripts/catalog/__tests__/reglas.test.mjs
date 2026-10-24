import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALCANCES_CUBIERTOS,
  ARCHIVOS_DEL_CATALOGO,
  catalogHashDe,
  jsonCanonico,
  leerCatalogo,
  leerEsquemas,
  mensajeDe,
  validarCatalogo,
} from '../../../packages/clinical-catalogs/validator/index.mjs';
import {
  exigirAtributoDeclarado,
  exigirCondicionBienFormada,
  exigirDestino,
  exigirDestinoExistente,
  exigirEstadoValido,
  verificarCatalogHash,
  vocabularioDe,
} from '../../../packages/clinical-catalogs/validator/reglas.mjs';
import { generarAllowlist } from '../generar-allowlist.mjs';
import { CATALOGO, FIXTURES, RAIZ } from './apoyo.mjs';

const leerTexto = (ruta) => readFileSync(ruta, 'utf8');
const esquemas = leerEsquemas(path.join(CATALOGO, 'schemas'), leerTexto);
const allowlist = JSON.parse(leerTexto(path.join(CATALOGO, 'validator/modelo.allowlist.json')));
const vocabulario = vocabularioDe(esquemas['datos-criticos']);
const atributos = { keys: [{ key: 'estado_menopausico', cancerTypes: ['mama'] }] };

const destino = (entity, field, match) => ({ destination: { entity, field, match } });

describe('exigirDestino', () => {
  it('devuelve destino_ausente cuando el ítem no trae destination', () => {
    expect(exigirDestino({ key: 'ki67' })).toBe('destino_ausente');
  });

  it('devuelve null cuando el ítem trae destination', () => {
    expect(exigirDestino(destino('Diagnosis', 'grade'))).toBeNull();
  });
});

describe('exigirDestinoExistente', () => {
  it('devuelve null cuando entidad, campo y clave de match existen', () => {
    const item = destino('Biomarker', 'value', { name: 'HER2', 'exam.exam_type': 'ISH' });

    expect(exigirDestinoExistente(item, allowlist)).toBeNull();
  });

  it('devuelve destino_inexistente cuando el campo no existe en la entidad', () => {
    expect(exigirDestinoExistente(destino('Diagnosis', 'menopause'), allowlist)).toBe(
      'destino_inexistente',
    );
  });

  it('devuelve destino_inexistente cuando la relación del match no existe', () => {
    const item = destino('Biomarker', 'value', { 'patient.id': 'x' });

    expect(exigirDestinoExistente(item, allowlist)).toBe('destino_inexistente');
  });

  it.each(['PatientIdentity', 'User', 'Session', 'AuditLog', 'ClinicalNote'])(
    'devuelve destino_inexistente cuando la entidad es %s aunque exista en el modelo',
    (entidad) => {
      expect(exigirDestinoExistente(destino(entidad, 'id'), allowlist)).toBe('destino_inexistente');
    },
  );

  it('acepta la entidad entera cuando no declara campo ni match', () => {
    expect(
      exigirDestinoExistente({ destination: { entity: 'PriorTreatment' } }, allowlist),
    ).toBeNull();
  });
});

describe('exigirAtributoDeclarado', () => {
  const clinicalAttribute = (clave) =>
    destino('ClinicalAttribute', 'value', { attribute_key: clave });

  it('devuelve null cuando la clave está declarada para el tipo de cáncer', () => {
    expect(
      exigirAtributoDeclarado(clinicalAttribute('estado_menopausico'), 'mama', atributos),
    ).toBeNull();
  });

  it('devuelve atributo_no_declarado cuando la clave no está declarada', () => {
    expect(exigirAtributoDeclarado(clinicalAttribute('menopausia_x'), 'mama', atributos)).toBe(
      'atributo_no_declarado',
    );
  });

  it('devuelve atributo_no_declarado cuando la clave es de otro tipo de cáncer', () => {
    expect(
      exigirAtributoDeclarado(clinicalAttribute('estado_menopausico'), 'prostata', atributos),
    ).toBe('atributo_no_declarado');
  });

  it('devuelve atributo_no_declarado cuando el destino no trae attribute_key', () => {
    expect(exigirAtributoDeclarado(destino('ClinicalAttribute', 'value'), 'mama', atributos)).toBe(
      'atributo_no_declarado',
    );
  });

  it('devuelve null cuando la entidad no es ClinicalAttribute', () => {
    expect(exigirAtributoDeclarado(destino('Diagnosis', 'grade'), 'mama', atributos)).toBeNull();
  });
});

describe('exigirCondicionBienFormada', () => {
  const claves = ['her2_ihq', 'her2_ish'];
  const condicional = (cambios = {}) => ({
    condition: { item: 'her2_ihq', operator: 'pertenencia', values: ['2+'] },
    whenConditionUnknown: 'faltante',
    ...cambios,
  });

  it('devuelve null cuando el ítem no tiene condición', () => {
    expect(exigirCondicionBienFormada({}, claves, vocabulario)).toBeNull();
  });

  it('devuelve null cuando la condición es completa', () => {
    expect(exigirCondicionBienFormada(condicional(), claves, vocabulario)).toBeNull();
  });

  it('devuelve condicion_invalida cuando la condición referencia una clave inexistente', () => {
    const item = condicional({
      condition: { item: 'her2_ihc_x', operator: 'igualdad', values: ['2+'] },
    });

    expect(exigirCondicionBienFormada(item, claves, vocabulario)).toBe('condicion_invalida');
  });

  it('devuelve condicion_invalida cuando falta whenConditionUnknown', () => {
    expect(
      exigirCondicionBienFormada(
        condicional({ whenConditionUnknown: undefined }),
        claves,
        vocabulario,
      ),
    ).toBe('condicion_invalida');
  });

  it('devuelve condicion_invalida cuando el operador no es declarativo', () => {
    const item = condicional({ condition: { item: 'her2_ihq', operator: 'eval', values: ['x'] } });

    expect(exigirCondicionBienFormada(item, claves, vocabulario)).toBe('condicion_invalida');
  });

  it('devuelve condicion_invalida cuando la condición no trae valores', () => {
    const item = condicional({ condition: { item: 'her2_ihq', operator: 'igualdad', values: [] } });

    expect(exigirCondicionBienFormada(item, claves, vocabulario)).toBe('condicion_invalida');
  });
});

describe('exigirEstadoValido', () => {
  it.each(['propuesta', 'pendiente', 'revisado'])(
    'devuelve null cuando el estado es %s',
    (estado) => {
      expect(exigirEstadoValido({ estado }, vocabulario)).toBeNull();
    },
  );

  it('devuelve estado_invalido cuando el estado es aprobado o falta', () => {
    expect(exigirEstadoValido({ estado: 'aprobado' }, vocabulario)).toBe('estado_invalido');
    expect(exigirEstadoValido({}, vocabulario)).toBe('estado_invalido');
  });
});

describe('catalogHash', () => {
  it('es independiente del orden de las claves y de los espacios', () => {
    expect(jsonCanonico({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it('cambia cuando cambia un campo cubierto por el alcance', () => {
    const antes = catalogHashDe(['datos_criticos'], [{ key: 'a', minValues: 1 }]);
    const despues = catalogHashDe(['datos_criticos'], [{ key: 'a', minValues: 2 }]);

    expect(despues).not.toBe(antes);
  });

  it('ignora lo que no cubre matriz_item_campo (solo clave y destino)', () => {
    const antes = catalogHashDe(
      ['matriz_item_campo'],
      [{ key: 'a', destination: { entity: 'Exam' }, minValues: 1 }],
    );
    const despues = catalogHashDe(
      ['matriz_item_campo'],
      [{ key: 'a', destination: { entity: 'Exam' }, minValues: 2 }],
    );

    expect(despues).toBe(antes);
  });

  it('declara los mismos alcances que el esquema único del bloque validation, al que remiten ambos archivos', () => {
    const delEsquema = esquemas.validation.properties.scope.items.enum;

    expect([...ALCANCES_CUBIERTOS].sort()).toEqual([...delEsquema].sort());
    for (const archivo of Object.values(ARCHIVOS_DEL_CATALOGO)) {
      expect(esquemas[archivo.esquema].properties.validation.$ref).toBe(esquemas.validation.$id);
    }
  });

  it('devuelve hash_distinto cuando el hash declarado no coincide y null cuando no hay bloque validation', () => {
    const items = [{ key: 'a', destination: { entity: 'Exam' } }];
    const catalogHash = catalogHashDe(['datos_criticos'], items);

    expect(verificarCatalogHash({ items })).toBeNull();
    expect(
      verificarCatalogHash({ items, validation: { scope: ['datos_criticos'], catalogHash } }),
    ).toBeNull();
    expect(
      verificarCatalogHash({
        items,
        validation: { scope: ['datos_criticos'], catalogHash: '0'.repeat(64) },
      }),
    ).toBe('hash_distinto');
  });
});

describe('registro de archivos del catálogo', () => {
  it.each(Object.entries(ARCHIVOS_DEL_CATALOGO))(
    'declara para %s un esquema que existe y reglas ejecutables',
    (nombre, { esquema, reglas }) => {
      expect(esquemas[esquema], nombre).toBeDefined();
      expect(reglas.length).toBeGreaterThan(0);
      expect(reglas.every((regla) => typeof regla === 'function')).toBe(true);
    },
  );

  it('lee un archivo por tipo por cada entrada del registro', () => {
    const { tipos } = leerCatalogo(path.join(FIXTURES, 'test-1.0.0'), leerTexto);

    expect(Object.keys(tipos['mama']).sort()).toEqual(Object.keys(ARCHIVOS_DEL_CATALOGO).sort());
  });
});

describe('validarCatalogo', () => {
  it('rechaza ecog con destino_inexistente cuando el modelo de test elimina performance_value [US-001 AC-4]', async () => {
    const sinCampo = leerTexto(path.join(RAIZ, 'apps/clinical-api/prisma/schema.prisma')).replace(
      /^\s*performanceValue\s.*$/m,
      '',
    );
    const archivos = leerCatalogo(path.join(FIXTURES, 'test-1.0.0'), leerTexto);

    const resultado = validarCatalogo({
      archivos,
      allowlist: await generarAllowlist(sinCampo),
      esquemas,
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.violaciones).toEqual([
      { codigo: 'destino_inexistente', tipoDeCancer: 'mama', elemento: 'ecog' },
    ]);
  });

  it('informa esquema_invalido sin valores cuando el ítem tiene una propiedad que el esquema no admite', () => {
    const archivos = leerCatalogo(path.join(FIXTURES, 'test-1.0.0'), leerTexto);
    archivos.tipos['mama']['datos-criticos'].items[0].script = 'alert(1)';

    const resultado = validarCatalogo({ archivos, allowlist, esquemas });

    expect(resultado.violaciones).toEqual([
      { codigo: 'esquema_invalido', tipoDeCancer: 'mama', archivo: 'datos-criticos' },
    ]);
  });

  it('no lanza cuando un archivo trae ítems que no son objetos', () => {
    const archivos = leerCatalogo(path.join(FIXTURES, 'test-1.0.0'), leerTexto);
    archivos.tipos['mama']['datos-criticos'].items = [null, 'x'];

    expect(() => validarCatalogo({ archivos, allowlist, esquemas })).not.toThrow();
  });

  it('nombra la violación de un ítem con tipoDeCancer y elemento, y la de un archivo con archivo [US-001 AC-2]', () => {
    const archivos = leerCatalogo(path.join(FIXTURES, 'test-1.1.0'), leerTexto);
    delete archivos.tipos['mama']['datos-criticos'].items[4].destination;
    archivos.tipos['prostata']['datos-criticos'].items[0].minValues = 9;

    const { violaciones } = validarCatalogo({ archivos, allowlist, esquemas });

    expect(violaciones).toEqual([
      { codigo: 'destino_ausente', tipoDeCancer: 'mama', elemento: 'ki67' },
      { codigo: 'hash_distinto', tipoDeCancer: 'prostata', archivo: 'datos-criticos' },
    ]);
    expect(violaciones.map(mensajeDe)).toEqual([
      'destino_ausente mama/ki67',
      'hash_distinto prostata/datos-criticos',
    ]);
  });

  describe('entradas deformadas', () => {
    const casos = [
      [
        'un match con clave que recorre el prototipo (constructor.x)',
        (mama) => {
          mama['datos-criticos'].items[0].destination.match = { 'constructor.x': 'v' };
        },
        'destino_inexistente',
      ],
      [
        'un bloque validation vacío',
        (mama) => {
          mama['datos-criticos'].validation = {};
        },
        'esquema_invalido',
      ],
      [
        'un bloque validation nulo',
        (mama) => {
          mama['datos-criticos'].validation = null;
        },
        'esquema_invalido',
      ],
      [
        'un archivo nulo',
        (mama) => {
          mama['datos-criticos'] = null;
        },
        'esquema_invalido',
      ],
      [
        'ítems nulos junto a un bloque validation',
        (mama) => {
          mama['datos-criticos'].items = [null];
          mama['datos-criticos'].validation = {
            scope: ['matriz_item_campo'],
            status: 'x',
            reviewerRole: 'x',
            date: '2026-10-24',
            catalogHash: '0'.repeat(64),
          };
        },
        'esquema_invalido',
      ],
    ];

    it.each(casos)(
      'devuelve una violación en lugar de lanzar cuando hay %s',
      (_nombre, deformar, codigoEsperado) => {
        const archivos = leerCatalogo(path.join(FIXTURES, 'test-1.0.0'), leerTexto);
        deformar(archivos.tipos['mama']);
        let resultado;

        expect(() => {
          resultado = validarCatalogo({ archivos, allowlist, esquemas });
        }).not.toThrow();

        expect(resultado.valido).toBe(false);
        expect(resultado.violaciones.map((violacion) => violacion.codigo)).toContain(
          codigoEsperado,
        );
      },
    );
  });

  it('no construye rutas de lectura con un tipo que no cumple la forma del manifiesto', () => {
    const leidas = [];
    const leer = (ruta) => {
      leidas.push(ruta);
      if (ruta.endsWith('manifest.json'))
        return JSON.stringify({ version: '1.0.0', cancerTypes: ['../x'], standards: [] });
      return JSON.stringify({ version: '1.0.0', keys: [] });
    };

    const archivos = leerCatalogo('/catalogo', leer);

    expect(leidas.some((ruta) => ruta.includes('..'))).toBe(false);
    expect(validarCatalogo({ archivos, allowlist, esquemas }).violaciones).toContainEqual(
      expect.objectContaining({ codigo: 'esquema_invalido' }),
    );
  });
});
