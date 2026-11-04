import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { crearCatalogoDeEscalas } from '../../../src/infrastructure/catalogo/catalogo-de-escalas.js';
import { crearProveedorDeCatalogo } from '../../../src/infrastructure/catalogo/catalog-version.provider.js';
import { ConfiguracionInvalidaError } from '../../../src/config/index.js';
import { RUTA_CATALOGO_FX01BB, RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';
import { leerTexto } from '../../support/completitud.js';

const temporales: string[] = [];
afterEach(() => {
  for (const ruta of temporales.splice(0)) rmSync(ruta, { recursive: true, force: true });
});

function catalogoSobre(ruta: string) {
  return crearCatalogoDeEscalas(ruta, leerTexto, crearProveedorDeCatalogo(ruta, leerTexto));
}

describe('crearCatalogoDeEscalas', () => {
  it.each([
    ['real', RUTA_CATALOGO_REAL],
    ['test-normalizacion-1.0.0', RUTA_CATALOGO_FX01BB],
  ])(
    'expone ECOG 0-5, TNM_8 y la gradación por tipo cuando se lee el catálogo %s',
    (_nombre, ruta) => {
      const escalas = catalogoSobre(ruta);

      expect(escalas.rangoDeEscala('ECOG')).toEqual({ minimo: 0, maximo: 5 });
      expect(escalas.rangoDeEscala('Karnofsky')).toEqual({ minimo: 0, maximo: 100 });
      expect(escalas.sistemaDeEstadificacionValido('TNM_8', 'mama')).toBe(true);
      expect(escalas.sistemaDeGradacionValido('nottingham', 'mama')).toBe(true);
      expect(escalas.sistemaDeGradacionValido('nottingham', 'prostata')).toBe(false);
      expect(escalas.sistemaDeGradacionValido('gleason_isup', 'prostata')).toBe(true);
    },
  );

  it('rechaza lo ajeno al catálogo: TNM_5, una escala desconocida y un tipo no declarado', () => {
    const escalas = catalogoSobre(RUTA_CATALOGO_FX01BB);

    expect(escalas.sistemaDeEstadificacionValido('TNM_5', 'mama')).toBe(false);
    expect(escalas.rangoDeEscala('Zubrod')).toBeUndefined();
    expect(escalas.sistemaDeEstadificacionValido('TNM_8', 'pulmon')).toBe(false);
  });

  it('lista sistemas y escalas en el orden del catálogo cuando se leen para el formulario', () => {
    const escalas = catalogoSobre(RUTA_CATALOGO_FX01BB);

    expect(escalas.sistemasDeEstadificacion('mama')).toEqual(['TNM_8']);
    expect(escalas.sistemasDeEstadificacion('pulmon')).toEqual([]);
    expect(escalas.sistemasDeGradacion('mama')).toEqual(['nottingham']);
    expect(escalas.sistemasDeGradacion('prostata')).toEqual(['gleason_isup']);
    expect(escalas.escalasFuncionales()).toEqual([
      { codigo: 'ECOG', minimo: 0, maximo: 5 },
      { codigo: 'Karnofsky', minimo: 0, maximo: 100 },
      { codigo: 'Lansky', minimo: 0, maximo: 100 },
    ]);
  });

  it('informa la versión del catálogo montado', () => {
    expect(catalogoSobre(RUTA_CATALOGO_FX01BB).version()).toBe('test-normalizacion-1.0.0');
  });

  it('no acepta ningún valor cuando el manifiesto no declara escalas', () => {
    const ruta = mkdtempSync(join(tmpdir(), 'escalas-'));
    temporales.push(ruta);
    writeFileSync(
      join(ruta, 'manifest.json'),
      JSON.stringify({ version: 'test-1.0.0', cancerTypes: ['mama'] }),
    );

    const escalas = catalogoSobre(ruta);

    expect(escalas.rangoDeEscala('ECOG')).toBeUndefined();
    expect(escalas.sistemaDeEstadificacionValido('TNM_8', 'mama')).toBe(false);
    expect(escalas.sistemaDeGradacionValido('nottingham', 'mama')).toBe(false);
    expect(escalas.sistemasDeEstadificacion('mama')).toEqual([]);
    expect(escalas.sistemasDeGradacion('mama')).toEqual([]);
    expect(escalas.escalasFuncionales()).toEqual([]);
  });

  it('impide el arranque cuando el manifiesto declara escalas y el archivo está roto', () => {
    const ruta = mkdtempSync(join(tmpdir(), 'escalas-'));
    temporales.push(ruta);
    writeFileSync(
      join(ruta, 'manifest.json'),
      JSON.stringify({ version: 'test-1.0.0', cancerTypes: ['mama'], escalas: true }),
    );
    writeFileSync(join(ruta, 'escalas.json'), '{ no es json');

    expect(() => catalogoSobre(ruta)).toThrow(ConfiguracionInvalidaError);
  });
});
