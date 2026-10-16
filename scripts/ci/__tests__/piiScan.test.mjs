import { describe, expect, it } from 'vitest';
import {
  DIRECTORIOS_GENERICOS,
  EXCLUSIONES_PERMITIDAS,
  detectarPii,
  escanear,
  estaEnAllowlistSintetica,
  normalizarValor,
  validarAllowlist,
  validarExclusiones,
} from '../pii-scan.mjs';
import { correo, digitos, documentoConPalabraClave, formatosReales, hashDelHallazgo, telefonoE164, telefonoLocal } from './helpers/piiSintetica.mjs';

const formatos = formatosReales();
const lineasDe = (texto) => detectarPii(texto, formatos).map(({ linea, formato }) => `${linea}:${formato}`);

describe('detectarPii', () => {
  it('devuelve documento_identidad en la línea 7 sin el valor cuando el número va precedido de su palabra clave [US-036 AC-4]', () => {
    const texto = `${'linea\n'.repeat(6)}{ "nota": "${documentoConPalabraClave(8)}" }`;

    const hallazgos = detectarPii(texto, formatos);

    expect(hallazgos.map((h) => [h.linea, h.formato])).toEqual([[7, 'documento_identidad']]);
    expect(JSON.stringify(hallazgos)).not.toContain(digitos(8));
  });

  it('no informa un número de 8 dígitos sin palabra clave [US-036 AC-4]', () => {
    expect(lineasDe(`código de lote ${digitos(8)}`)).toEqual([]);
  });

  it('informa un documento tras una palabra clave en camelCase como numeroDocumento [US-036 AC-4]', () => {
    expect(lineasDe(`"numeroDocumento": "${digitos(9)}"`)).toEqual(['1:documento_identidad']);
  });

  it('informa un documento con separadores y palabras entre la clave y el número [US-036 AC-4]', () => {
    expect(lineasDe(`cédula de ciudadanía No. ${digitos(2)}.${digitos(3)}.${digitos(3)}`)).toEqual(['1:documento_identidad']);
  });

  it('no informa los números de una ruta tras una palabra clave porque no son un documento [US-036 AC-4]', () => {
    expect(lineasDe(`https://corpus.oncolens.test/documentos/CDR${digitos(10, '0')}`)).toEqual([]);
  });

  it('no informa una fecha tras una palabra clave [US-036 AC-4]', () => {
    expect(lineasDe('documento emitido 2026-10-13 y 13/10/2026')).toEqual([]);
  });

  it('no informa un valor con el prefijo centinela SINT- que exigen los ejemplos [US-036 AC-4]', () => {
    expect(lineasDe(`"nationalId": "SINT-${digitos(7, '0')}"`)).toEqual([]);
  });

  it('sigue informando el mismo número sin el prefijo SINT- en la misma línea que uno con prefijo [US-036 AC-4]', () => {
    const texto = `"nationalId": "SINT-${digitos(7, '0')}", "documento": "${digitos(7, '0')}"`;

    expect(lineasDe(texto)).toEqual(['1:documento_identidad']);
  });

  it('detecta un teléfono E.164 [US-036 AC-4]', () => {
    expect(lineasDe(`contacto ${telefonoE164()}`)).toEqual(['1:telefono_e164']);
  });

  it('detecta un teléfono E.164 pegado a una palabra en camelCase como contactoTel [US-036 AC-4]', () => {
    expect(lineasDe(`contactoTel${telefonoE164()}`)).toContain('1:telefono_e164');
  });

  it('detecta un teléfono local con separadores tras su palabra clave [US-036 AC-4]', () => {
    expect(lineasDe(telefonoLocal())).toEqual(['1:telefono_local']);
  });

  it('informa un correo de un dominio ordinario [US-036 AC-4]', () => {
    expect(lineasDe(`escribir a ${correo('paciente', 'clinica.org')}`)).toEqual(['1:correo']);
  });

  it('no informa correos de dominios reservados example.com, .test, .local, .invalid y .localhost [US-036 AC-4]', () => {
    const dominios = ['example.com', 'demo.test', 'host.local', 'x.invalid', 'app.localhost', 'sub.example.org'];
    const correos = dominios.map((dominio) => correo('usuario', dominio));

    expect(lineasDe(correos.join(' '))).toEqual([]);
  });

  it('informa un dominio que solo termina parecido a uno reservado, como notexample.com [US-036 AC-4]', () => {
    expect(lineasDe(correo('g', 'notexample.com'))).toEqual(['1:correo']);
  });

  it('no informa el buzón institucional exento pero sí otro buzón del mismo dominio [US-036 AC-4]', () => {
    expect(lineasDe(correo('icd', 'who.int'))).toEqual([]);
    expect(lineasDe(correo('persona', 'who.int'))).toEqual(['1:correo']);
  });
});

describe('normalizarValor', () => {
  const por = (id) => formatos.find((formato) => formato.id === id);

  it('deja solo letras mayúsculas y dígitos en un documento [US-036 AC-4]', () => {
    expect(normalizarValor(por('documento_identidad'), 'ab-12.3 4')).toBe('AB1234');
  });

  it('conserva el + inicial y los dígitos de un teléfono [US-036 AC-4]', () => {
    expect(normalizarValor(por('telefono_e164'), '+57 300-1')).toBe('+573001');
  });

  it('pasa a minúsculas y quita espacios en un correo [US-036 AC-4]', () => {
    expect(normalizarValor(por('correo'), correo('Ana', 'Clinica.ORG'))).toBe(correo('ana', 'clinica.org'));
  });
});

describe('validarExclusiones', () => {
  it('rechaza una exclusión que cubre docs/ [US-036 AC-4]', () => {
    const errores = validarExclusiones([{ patron: 'docs/**', motivo: 'ruido' }]);

    expect(errores).toEqual(['exclusión no permitida: docs/** (solo lockfiles y binarios de la lista cerrada)']);
  });

  it('rechaza una exclusión que no está en la lista cerrada de lockfiles y binarios [US-036 AC-4]', () => {
    expect(validarExclusiones([{ patron: '**/*.json', motivo: 'datos' }])).toHaveLength(1);
  });

  it('acepta cada patrón de la lista cerrada con su motivo [US-036 AC-4]', () => {
    const exclusiones = EXCLUSIONES_PERMITIDAS.map((patron) => ({ patron, motivo: 'lockfile o binario' }));

    expect(validarExclusiones(exclusiones)).toEqual([]);
  });

  it('exige un motivo en cada exclusión [US-036 AC-4]', () => {
    expect(validarExclusiones([{ patron: '**/package-lock.json' }])).toEqual(['exclusión sin motivo: **/package-lock.json']);
  });
});

describe('validarAllowlist', () => {
  const entrada = (cambios = {}) => ({
    fixture: 'FX-prueba',
    clase: 'sintetico',
    rutas: ['ci/tests/cases/ac4-allowlist/**'],
    valores: [{ formato: 'documento_identidad', sha256: 'a'.repeat(64) }],
    motivo: 'prueba',
    ...cambios,
  });

  it('acepta una entrada completa de un directorio de fixture [US-036 AC-4]', () => {
    expect(validarAllowlist([entrada()])).toEqual([]);
  });

  it('falla nombrando la entrada de la allowlist sin clase sintetico [US-036 AC-4]', () => {
    expect(validarAllowlist([entrada({ clase: undefined })])).toEqual(['entrada de la allowlist FX-prueba: sin clase sintetico']);
  });

  it('falla nombrando la entrada de la allowlist sin valores [US-036 AC-4]', () => {
    expect(validarAllowlist([entrada({ valores: [] })])).toEqual(['entrada de la allowlist FX-prueba: sin valores']);
  });

  it('falla nombrando la entrada sin rutas [US-036 AC-4]', () => {
    expect(validarAllowlist([entrada({ rutas: [] })])).toEqual(['entrada de la allowlist FX-prueba: sin rutas']);
  });

  it.each(['backlog/**', 'apps/clinical-api/test/**', 'openspec/changes/**', 'ci/tests/**', '**', '*/seed/**', 'docs/*.md', 'data/**/*.json'])(
    'falla con un glob más amplio que un directorio de fixture como %s [US-036 AC-4]',
    (glob) => {
      const errores = validarAllowlist([entrada({ rutas: [glob] })]);

      expect(errores).toEqual([`entrada de la allowlist FX-prueba: glob más amplio que un directorio de fixture (${glob})`]);
    },
  );

  it('acepta los seis globs iniciales de la allowlist [US-036 AC-4]', () => {
    const iniciales = [
      'backlog/features/FEAT-T4a-*.md',
      'apps/clinical-api/prisma/seed/**',
      'apps/clinical-api/test/**/deidentification/**',
      'openspec/changes/*-desidentificacion-*/**',
      'openspec/specs/deidentification/**',
      'ci/tests/cases/ac4-allowlist/**',
    ];

    expect(validarAllowlist(iniciales.map((glob) => entrada({ rutas: [glob] })))).toEqual([]);
  });

  it('trata los directorios genéricos como no identificativos de un fixture [US-036 AC-4]', () => {
    expect(DIRECTORIOS_GENERICOS).toContain('backlog');
  });
});

describe('estaEnAllowlistSintetica', () => {
  const conocido = `${documentoConPalabraClave(8)}`;
  const valor = hashDelHallazgo(conocido);
  const allowlist = [{ fixture: 'FX-prueba', clase: 'sintetico', rutas: ['ci/tests/cases/ac4-allowlist/**'], valores: [valor], motivo: 'prueba' }];

  it('omite un valor cuya ruta casa con un glob y cuyo hash está en la entrada [US-036 AC-4]', () => {
    expect(estaEnAllowlistSintetica('ci/tests/cases/ac4-allowlist/a.md', valor.formato, valor.sha256, allowlist)).toBe(true);
  });

  it('sigue informando un valor sin hash en la entrada aunque la ruta case [US-036 AC-4]', () => {
    const otro = hashDelHallazgo(documentoConPalabraClave(9));

    expect(estaEnAllowlistSintetica('ci/tests/cases/ac4-allowlist/a.md', otro.formato, otro.sha256, allowlist)).toBe(false);
  });

  it('sigue informando un valor con hash listado en una ruta fuera de los globs [US-036 AC-4]', () => {
    expect(estaEnAllowlistSintetica('docs/notas.md', valor.formato, valor.sha256, allowlist)).toBe(false);
  });

  it('no mezcla el hash de una entrada con las rutas de otra [US-036 AC-4]', () => {
    const dos = [
      { ...allowlist[0], valores: [hashDelHallazgo(documentoConPalabraClave(9))] },
      { fixture: 'otra', clase: 'sintetico', rutas: ['openspec/specs/deidentification/**'], valores: [valor], motivo: 'prueba' },
    ];

    expect(estaEnAllowlistSintetica('ci/tests/cases/ac4-allowlist/a.md', valor.formato, valor.sha256, dos)).toBe(false);
  });
});

describe('escanear', () => {
  const leerDe = (archivos) => (ruta) => (ruta in archivos ? Buffer.from(archivos[ruta]) : null);
  const sinExclusiones = { formatos, excluir: [], allowlist: [] };

  it('informa PII en contracts/examples y en apps/*/test* con la raíz git ls-files [US-036 AC-4]', () => {
    const archivos = {
      'contracts/examples/solicitud.json': `{ "nota": "${documentoConPalabraClave(8)}" }`,
      'apps/clinical-api/test/fixtures/paciente.json': `{ "nota": "${documentoConPalabraClave(9)}" }`,
      'README.md': 'sin datos',
    };

    const { hallazgos } = escanear({ archivos: Object.keys(archivos), leer: leerDe(archivos), ...sinExclusiones });

    expect(hallazgos.map((h) => `${h.ruta}:${h.linea}:${h.formato}`)).toEqual([
      'contracts/examples/solicitud.json:1:documento_identidad',
      'apps/clinical-api/test/fixtures/paciente.json:1:documento_identidad',
    ]);
  });

  it('omite un lockfile de la lista cerrada pero no el resto del árbol [US-036 AC-4]', () => {
    const archivos = { 'package-lock.json': documentoConPalabraClave(8), 'notas.md': documentoConPalabraClave(8) };
    const excluir = [{ patron: '**/package-lock.json', motivo: 'lockfile' }];

    const { hallazgos, problemas } = escanear({ archivos: Object.keys(archivos), leer: leerDe(archivos), formatos, excluir, allowlist: [] });

    expect(problemas).toEqual([]);
    expect(hallazgos.map((h) => h.ruta)).toEqual(['notas.md']);
  });

  it('lista un binario como no escaneado sin informarlo como hallazgo [US-036 AC-4]', () => {
    const archivos = { 'data/eval/a.pdf': Buffer.from([0x25, 0x50, 0x00, 0x46]) };

    const resultado = escanear({ archivos: Object.keys(archivos), leer: (ruta) => archivos[ruta], ...sinExclusiones });

    expect(resultado.noEscaneados).toEqual(['data/eval/a.pdf']);
    expect(resultado.hallazgos).toEqual([]);
  });

  it('reporta como problema una exclusión que cubre docs/ y no la aplica [US-036 AC-4]', () => {
    const archivos = { 'docs/notas.md': documentoConPalabraClave(8) };
    const excluir = [{ patron: 'docs/**', motivo: 'ruido' }];

    const resultado = escanear({ archivos: Object.keys(archivos), leer: leerDe(archivos), formatos, excluir, allowlist: [] });

    expect(resultado.problemas).toHaveLength(1);
    expect(resultado.hallazgos).toHaveLength(1);
  });

  it('omite el valor de la allowlist en su fixture y sigue informando un segundo valor en la misma ruta [US-036 AC-4]', () => {
    const permitido = documentoConPalabraClave(8);
    const allowlist = [
      { fixture: 'FX', clase: 'sintetico', rutas: ['ci/tests/cases/ac4-allowlist/**'], valores: [hashDelHallazgo(permitido)], motivo: 'prueba' },
    ];
    const archivos = { 'ci/tests/cases/ac4-allowlist/datos.md': `${permitido}\n${documentoConPalabraClave(9)}` };

    const { hallazgos } = escanear({ archivos: Object.keys(archivos), leer: leerDe(archivos), formatos, excluir: [], allowlist });

    expect(hallazgos.map((h) => `${h.linea}:${h.formato}`)).toEqual(['2:documento_identidad']);
  });
});
