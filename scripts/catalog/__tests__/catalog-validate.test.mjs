import { afterEach, describe, expect, it } from 'vitest';
import {
  PLAZO_PROCESO_MS,
  RAIZ,
  copiarFixture,
  ejecutarValidador,
  limpiarCopias,
  modificarJson,
} from './apoyo.mjs';

afterEach(limpiarCopias);

const itemDe = (contenido, clave) => contenido.items.find((item) => item.key === clave);

describe('catalog:validate · aceptación del catálogo', () => {
  it(
    'termina con código 0 e informa catalogVersion test-1.0.0 cuando todos los ítems tienen destino [US-001 AC-1]',
    () => {
      const resultado = ejecutarValidador(copiarFixture('test-1.0.0'));

      expect(resultado.codigo).toBe(0);
      expect(resultado.salida).toContain('catalogVersion=test-1.0.0');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · RN-29 destino obligatorio y existente', () => {
  it(
    'rechaza y nombra ki67 cuando un dato crítico no tiene destino [US-001 AC-2]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => delete itemDe(c, 'ki67').destination);

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('destino_ausente mama/ki67');
      expect(resultado.salida).not.toContain(catalogo);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza y nombra estado_menopausico cuando un criterio de aplicabilidad no tiene destino [US-001 AC-3]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/aplicabilidad.json', (c) => delete itemDe(c, 'estado_menopausico').destination);

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('destino_ausente mama/estado_menopausico');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza con destino_inexistente y nombra estado_menopausico cuando apunta a Diagnosis.menopause [US-001 AC-4]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => {
        itemDe(c, 'estado_menopausico').destination = { entity: 'Diagnosis', field: 'menopause' };
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('destino_inexistente mama/estado_menopausico');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza con destino_inexistente y no revela la ruta cuando el destino es PatientIdentity.id_type [US-001 AC-4]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => {
        itemDe(c, 'estado_menopausico').destination = { entity: 'PatientIdentity', field: 'id_type' };
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('destino_inexistente mama/estado_menopausico');
      expect(resultado.salida).not.toContain(catalogo);
      expect(resultado.salida).not.toContain('id_type');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza y nombra el ítem cuando el attribute_key de ClinicalAttribute no está declarado [US-001 AC-4]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => {
        itemDe(c, 'estado_menopausico').destination.match.attribute_key = 'menopausia_x';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('atributo_no_declarado mama/estado_menopausico');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · condiciones declarativas', () => {
  it(
    'rechaza y nombra her2_ish cuando su condición referencia una clave inexistente [US-001 AC-5]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => {
        itemDe(c, 'her2_ish').condition.item = 'her2_ihc_x';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('condicion_invalida mama/her2_ish');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza y nombra her2_ish cuando tiene condición y no declara whenConditionUnknown [US-001 AC-5]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => delete itemDe(c, 'her2_ish').whenConditionUnknown);

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('condicion_invalida mama/her2_ish');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · integridad de una versión revisada', () => {
  it(
    'rechaza por catalogHash distinto cuando se cambia minValues de psa_serie sin versión nueva [US-001 AC-8]',
    () => {
      const catalogo = copiarFixture('test-1.1.0');
      expect(ejecutarValidador(catalogo).codigo).toBe(0);
      modificarJson(catalogo, 'prostata/datos-criticos.json', (c) => (itemDe(c, 'psa_serie').minValues = 4));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('hash_distinto prostata/datos-criticos');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza con hash_distinto cuando se cambia el destination.field de un criterio de una versión revisada [US-001 AC-8]',
    () => {
      const catalogo = copiarFixture('test-1.1.0');
      modificarJson(catalogo, 'mama/aplicabilidad.json', (c) => {
        itemDe(c, 'estado_menopausico').destination.field = 'observed_at';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('hash_distinto mama/aplicabilidad');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza y nombra ki67 cuando su estado es aprobado [US-001 AC-8]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => (itemDe(c, 'ki67').estado = 'aprobado'));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('estado_invalido mama/ki67');
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · claves únicas', () => {
  it(
    'rechaza con clave_duplicada y nombra ki67 cuando dos ítems del mismo tipo y archivo comparten clave [US-001 AC-2]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'mama/datos-criticos.json', (c) => c.items.push({ ...itemDe(c, 'ki67') }));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('clave_duplicada mama/ki67');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'acepta la misma clave en tipos de cáncer distintos (tnm en mama y en próstata) [US-001 AC-7]',
    () => {
      const catalogo = copiarFixture('test-1.0.0');
      modificarJson(catalogo, 'prostata/datos-criticos.json', (c) =>
        c.items.push({ ...itemDe(c, 'gleason_isup'), key: 'tnm', cancerType: 'prostata' }),
      );

      expect(ejecutarValidador(catalogo).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});

describe('catalog:validate · cuerpo del mensaje', () => {
  it('no incluye la raíz del repositorio en la salida de un rechazo [US-001 AC-2]', () => {
    const catalogo = copiarFixture('test-1.0.0');
    modificarJson(catalogo, 'mama/datos-criticos.json', (c) => delete itemDe(c, 'ki67').destination);

    expect(ejecutarValidador(catalogo).salida).not.toContain(RAIZ);
  });
});
