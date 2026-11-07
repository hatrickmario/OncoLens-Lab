import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  terminosDelCatalogo,
  violacionesDeTemasDelCaso,
} from '../../../packages/clinical-catalogs/validator/index.mjs';
import { CATALOGO } from './apoyo.mjs';

const leer = (ruta) => JSON.parse(readFileSync(path.join(CATALOGO, ruta), 'utf8'));
const fixture = () => leer('test/fixtures/temas-del-caso.json');
const catalogo = () => ({
  escalas: leer('escalas.json'),
  tipos: Object.fromEntries(
    ['mama', 'prostata'].map((tipo) => [
      tipo,
      {
        codigos: leer(`${tipo}/codigos.json`),
        'datos-criticos': leer(`${tipo}/datos-criticos.json`),
      },
    ]),
  ),
});

function validarEsquema(contenido) {
  const ajv = new Ajv2020({ strict: true });
  ajv.addSchema(leer('schemas/comun.schema.json'));
  const validar = ajv.compile(leer('schemas/temas-del-caso.schema.json'));
  return validar(contenido);
}

describe('fixture compartido temas-del-caso.json (L1D-329, [US-271 AC-6])', () => {
  it('cumple su esquema y cada término esperado existe en el catálogo versionado [US-271 AC-6]', () => {
    expect(validarEsquema(fixture())).toBe(true);
    expect(violacionesDeTemasDelCaso(fixture(), catalogo())).toEqual([]);
  });

  it('cubre mama, próstata con grado, sin estadio ni biomarcador, valor fuera del catálogo y tipo sin etiqueta', () => {
    const ids = fixture().casos.map((c) => c.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'mama-completo',
        'prostata-con-grado',
        'mama-sin-estadio-ni-biomarcador',
        'mama-valor-fuera-del-catalogo',
        'tipo-sin-etiqueta',
      ]),
    );
  });

  it('rechaza un caso sin alguna de las dos entradas', () => {
    const roto = fixture();
    delete roto.casos[0].clinicalContext;

    expect(violacionesDeTemasDelCaso(roto, catalogo())).toEqual([
      { codigo: 'entrada_incompleta', archivo: 'temas-del-caso', elemento: 'mama-completo' },
    ]);
    expect(validarEsquema(roto)).toBe(false);
  });

  it('rechaza un término esperado ausente del catálogo sin nombrarlo', () => {
    const roto = fixture();
    roto.casos[0].salida.terminos.push('Término inventado');

    const violaciones = violacionesDeTemasDelCaso(roto, catalogo());

    expect(violaciones).toEqual([
      {
        codigo: 'termino_fuera_del_catalogo',
        archivo: 'temas-del-caso',
        elemento: 'mama-completo',
      },
    ]);
    expect(JSON.stringify(violaciones)).not.toContain('inventado');
  });

  it('el catálogo ofrece sus etiquetas, estadios, grados y valores de biomarcador como términos', () => {
    const terminos = terminosDelCatalogo(catalogo());

    expect(
      ['Cáncer de mama', 'IIA', 'ISUP 3', 'HER2', '3+'].filter((t) => !terminos.has(t)),
    ).toEqual([]);
    expect(terminos.has('Término inventado')).toBe(false);
  });
});
