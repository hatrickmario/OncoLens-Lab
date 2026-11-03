import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError } from '../../../src/config/index.js';
import { crearProveedorDeCatalogo } from '../../../src/infrastructure/catalogo/catalog-version.provider.js';
import { crearCatalogoTerminologico } from '../../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { ESTANDARES } from '../../../src/modules/reconciliation/ports.js';
import { RUTA_CATALOGO_FX01BB, RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';
import { leerTexto } from '../../support/reconciliation.js';

let directorio: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'catalogo-unicidad-'));
  cpSync(RUTA_CATALOGO_FX01BB, directorio, { recursive: true });
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

const crear = () =>
  crearCatalogoTerminologico(
    directorio,
    leerTexto,
    crearProveedorDeCatalogo(directorio, leerTexto),
  );

interface Entrada {
  terminoCanonico: string;
  estandar: string;
  codigo: string;
  nombreOficial: string;
  etiquetaEs: string;
  versionFuente: string;
}

function agregarEntrada(archivo: string, entrada: Entrada): void {
  const ruta = path.join(directorio, archivo);
  const codigos = JSON.parse(readFileSync(ruta, 'utf8')) as { entradas: Entrada[] };
  codigos.entradas.push(entrada);
  writeFileSync(ruta, JSON.stringify(codigos));
}

const OTRA_ENTRADA: Omit<Entrada, 'terminoCanonico' | 'estandar' | 'codigo'> = {
  nombreOficial: 'x',
  etiquetaEs: 'x',
  versionFuente: 'v',
};

describe('catálogo terminológico: un código por término y estándar (P3-3 de l1d-84)', () => {
  it('lanza catalogo_invalido cuando un término canónico tiene dos códigos LOINC', () => {
    agregarEntrada('mama/codigos.json', {
      ...OTRA_ENTRADA,
      terminoCanonico: 'Ki-67',
      estandar: 'loinc',
      codigo: 'LOINC-T-OTRO',
    });

    expect(crear).toThrow(ConfiguracionInvalidaError);
  });

  it('acepta varios códigos ATC para el mismo término canónico', () => {
    agregarEntrada('mama/codigos.json', {
      ...OTRA_ENTRADA,
      terminoCanonico: 'letrozol',
      estandar: 'atc',
      codigo: 'L02BG04',
    });
    agregarEntrada('mama/codigos.json', {
      ...OTRA_ENTRADA,
      terminoCanonico: 'letrozol',
      estandar: 'atc',
      codigo: 'L02BG05',
    });

    expect(() => crear()).not.toThrow();
  });

  it('acepta el catálogo real montado', () => {
    expect(() =>
      crearCatalogoTerminologico(
        RUTA_CATALOGO_REAL,
        leerTexto,
        crearProveedorDeCatalogo(RUTA_CATALOGO_REAL, leerTexto),
      ),
    ).not.toThrow();
  });
});

describe('ESTANDARES del puerto', () => {
  it('coincide con el enum estandar de codigos.schema.json', () => {
    const esquema = JSON.parse(
      readFileSync(path.join(RUTA_CATALOGO_REAL, 'schemas/codigos.schema.json'), 'utf8'),
    ) as {
      properties: {
        entradas: { items: { properties: { estandar: { enum: string[] } } } };
      };
    };

    expect([...ESTANDARES].sort()).toEqual(
      [...esquema.properties.entradas.items.properties.estandar.enum].sort(),
    );
  });
});
