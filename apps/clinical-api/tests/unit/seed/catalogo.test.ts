import { describe, expect, it } from 'vitest';
import {
  leerCatalogo,
  resolverCodigoDelCatalogo,
  type CatalogoClinico,
} from '../../../prisma/seed/catalogo.js';

const ENTRADA_DE_PRUEBA = {
  terminoCanonico: 'termino-de-prueba',
  estandar: 'cie10',
  codigo: 'X00.0',
  nombreOficial: 'Nombre Oficial Sin Modificar, con Mayúsculas',
  etiquetaEs: 'Etiqueta propia',
  versionFuente: 'fuente de prueba',
} as const;

const CATALOGO: CatalogoClinico = { version: '9.9.9', entradas: [ENTRADA_DE_PRUEBA] };

describe('resolverCodigoDelCatalogo', () => {
  it('devuelve el código y el nombre oficial intacto cuando el término tiene entrada', () => {
    expect(resolverCodigoDelCatalogo(CATALOGO, 'cie10', 'termino-de-prueba')).toEqual({
      codigo: 'X00.0',
      nombreOficial: 'Nombre Oficial Sin Modificar, con Mayúsculas',
      mappingStatus: 'mapeado',
    });
  });

  it('devuelve código nulo y no_mapeado cuando el término no tiene entrada', () => {
    expect(resolverCodigoDelCatalogo(CATALOGO, 'cie10', 'otro-termino')).toEqual({
      codigo: null,
      mappingStatus: 'no_mapeado',
    });
  });

  it('devuelve no_mapeado cuando la entrada del término es de otro estándar', () => {
    expect(resolverCodigoDelCatalogo(CATALOGO, 'loinc', 'termino-de-prueba')).toEqual({
      codigo: null,
      mappingStatus: 'no_mapeado',
    });
  });
});

describe('leerCatalogo', () => {
  const archivos: Record<string, string> = {
    '/cat/manifest.json': JSON.stringify({
      version: '9.9.9',
      cancerTypes: ['mama', 'prostata'],
      standards: ['cie10'],
    }),
    '/cat/mama/codigos.json': JSON.stringify({ entradas: [ENTRADA_DE_PRUEBA] }),
    '/cat/prostata/codigos.json': JSON.stringify({ entradas: [] }),
  };
  const leer = (ruta: string): string => {
    const contenido = archivos[ruta];
    if (contenido === undefined) throw new Error(`ENOENT ${ruta}`);
    return contenido;
  };

  it('devuelve la versión del manifest y las entradas de cada tipo de cáncer', () => {
    expect(leerCatalogo('/cat', leer)).toEqual(CATALOGO);
  });

  it('falla sin eco del contenido cuando una entrada trae un estándar desconocido', () => {
    const roto = { ...archivos, '/cat/mama/codigos.json': JSON.stringify({ entradas: [{ ...ENTRADA_DE_PRUEBA, estandar: 'inventado' }] }) };

    expect(() => leerCatalogo('/cat', (ruta) => roto[ruta] ?? '')).toThrow(/mama\/codigos\.json/);
  });
});
