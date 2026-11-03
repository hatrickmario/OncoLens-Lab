import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearCatalogoTerminologico } from '../../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { crearProveedorDeCatalogo } from '../../../src/infrastructure/catalogo/catalog-version.provider.js';
import { ConfiguracionInvalidaError } from '../../../src/config/index.js';
import { RUTA_CATALOGO_FX01BB } from '../../support/catalogo-terminologico.js';
import { leerTexto } from '../../support/reconciliation.js';

let directorio: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'catalogo-terminologico-'));
  cpSync(RUTA_CATALOGO_FX01BB, directorio, { recursive: true });
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

const crear = () =>
  crearCatalogoTerminologico(
    directorio,
    leerTexto,
    crearProveedorDeCatalogo(directorio, leerTexto),
  );

describe('crearCatalogoTerminologico', () => {
  it('devuelve las entradas del estándar pedido y la versión del manifiesto cuando el catálogo es válido', () => {
    const catalogo = crear();

    expect(catalogo.version()).toBe('test-normalizacion-1.0.0');
    expect(catalogo.entradas('mama', 'loinc').map((e) => e.codigo)).toEqual([
      'LOINC-T-HER2',
      'LOINC-T-RE',
      'LOINC-T-KI67',
    ]);
  });

  it('devuelve listas vacías cuando el tipo de cáncer no está en el catálogo', () => {
    const catalogo = crear();

    expect(catalogo.entradas('leucemia', 'cie10')).toEqual([]);
    expect(catalogo.sinonimos('leucemia')).toEqual([]);
  });

  it.each([
    [
      'codigos.json con un estándar desconocido',
      'mama/codigos.json',
      '{"entradas":[{"terminoCanonico":"x","estandar":"snomed","codigo":"1","nombreOficial":"x","etiquetaEs":"x","versionFuente":"v"}]}',
    ],
    ['codigos.json sin la clave entradas', 'mama/codigos.json', '{}'],
    ['sinonimos.json con JSON roto', 'mama/sinonimos.json', '{no es json'],
    [
      'sinonimos.json con versión mal formada',
      'prostata/sinonimos.json',
      '{"version":"uno","items":[]}',
    ],
  ])('lanza catalogo_invalido sin ruta ni contenido cuando %s', (_caso, archivo, contenido) => {
    writeFileSync(path.join(directorio, archivo), contenido);

    let error: unknown;
    try {
      crear();
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConfiguracionInvalidaError);
    expect(error).toMatchObject({
      variable: 'CLINICAL_CATALOG_PATH',
      regla: 'esquema_invalido',
      motivo: 'catalogo_invalido',
    });
    expect(String((error as Error).message)).not.toContain(directorio);
  });
});
