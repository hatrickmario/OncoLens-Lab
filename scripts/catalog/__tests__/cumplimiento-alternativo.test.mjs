import { readFileSync } from 'node:fs';
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

const FIXTURE = 'fx-04-a/test-1.0.0';
const itemReal = (tipo) =>
  JSON.parse(readFileSync(path.join(CATALOGO, tipo, 'datos-criticos.json'), 'utf8')).items.find(
    (item) => item.key === 'tratamientos_previos',
  );
const sobreElItem = (catalogo, cambio) =>
  modificarJson(catalogo, 'mama/datos-criticos.json', (c) => {
    cambio(c.items.find((item) => item.key === 'tratamientos_previos'));
  });

describe('catalog:validate · satisfiedBy de datos-criticos.json (d5fb-04, RN-29)', () => {
  it.each(['mama', 'prostata'])(
    'acepta el catálogo real y declara sin_tratamiento_previo como cumplimiento de tratamientos_previos en %s [RN-29]',
    (tipo) => {
      const resultado = ejecutarValidador(CATALOGO);

      expect(resultado.codigo).toBe(0);
      expect(itemReal(tipo).satisfiedBy).toEqual([
        { entity: 'ClinicalAttribute', attribute_key: 'sin_tratamiento_previo', value: 'si' },
      ]);
      // RN-29: satisfiedBy acompaña al destino, no lo sustituye.
      expect(itemReal(tipo).destination).toEqual({ entity: 'PriorTreatment' });
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'acepta el fixture coherente con satisfiedBy [RN-29]',
    () => {
      expect(ejecutarValidador(copiarFixture(FIXTURE)).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza una referencia colgante y nombra el ítem y la clave [RN-29]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      sobreElItem(catalogo, (item) => {
        item.satisfiedBy[0].attribute_key = 'clave_que_no_existe';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'atributo_no_declarado mama/tratamientos_previos campo=clave_que_no_existe',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un valor que la clave no declara y nombra el ítem y la clave [RN-29]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      sobreElItem(catalogo, (item) => {
        item.satisfiedBy[0].value = 'no';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'valor_no_declarado mama/tratamientos_previos campo=sin_tratamiento_previo',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un satisfiedBy cuya entidad no es ClinicalAttribute [RN-29]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      sobreElItem(catalogo, (item) => {
        item.satisfiedBy[0].entity = 'Biomarker';
      });

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain(
        'cumplimiento_alternativo_invalido mama/tratamientos_previos',
      );
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza un satisfiedBy vacío por el esquema [RN-29]',
    () => {
      const catalogo = copiarFixture(FIXTURE);
      sobreElItem(catalogo, (item) => {
        item.satisfiedBy = [];
      });

      expect(ejecutarValidador(catalogo).codigo).not.toBe(0);
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'sigue aceptando un fixture cuyos ítems no declaran satisfiedBy [RN-29]',
    () => {
      expect(ejecutarValidador(copiarFixture('test-normalizacion-1.0.0')).codigo).toBe(0);
    },
    PLAZO_PROCESO_MS,
  );
});
