import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { violacionesDePlantillas } from '../../../packages/clinical-catalogs/validator/index.mjs';
import { CATALOGO, PLAZO_PROCESO_MS, ejecutarValidador } from './apoyo.mjs';

const leer = (ruta) => JSON.parse(readFileSync(path.join(CATALOGO, ruta), 'utf8'));
const PROHIBIDOS = leer('lenguaje/terminos-prohibidos.json');

const item = (id, ...variantes) => ({ id, variantes });
const deTipo = (id) => item(id, { texto: '¿Qué evidencia hay para {tipo}?', ranuras: ['tipo'] });
const BASE = [deTipo('a'), deTipo('b'), deTipo('c')];
const archivo = (...items) => ({ version: '1.8.0', items });
const codigos = (resultado) => resultado.map((v) => `${v.codigo}:${v.elemento ?? ''}`);

describe('catalog:validate · <tipo>/plantillas.json (L1D-324, ADR-52)', () => {
  it('acepta las plantillas reales de mama y próstata y el catálogo completo [US-267 AC-9]', () => {
    for (const tipo of ['mama', 'prostata']) {
      expect(violacionesDePlantillas(leer(`${tipo}/plantillas.json`), PROHIBIDOS)).toEqual([]);
    }
    expect(ejecutarValidador(CATALOGO).codigo).toBe(0);
  }, PLAZO_PROCESO_MS);

  it('rechaza una ranura desconocida y nombra el ítem sin su texto', () => {
    const rara = item('rara', { texto: '¿Qué hay para {tipo} y {pais}?', ranuras: ['tipo'] });

    expect(codigos(violacionesDePlantillas(archivo(...BASE, rara), PROHIBIDOS))).toEqual([
      'ranura_desconocida:rara',
    ]);
  });

  it('rechaza una variante cuyas ranuras declaradas no son las que usa su texto', () => {
    const torcida = item('torcida', {
      texto: '¿Qué hay para {tipo} en estadio {estadio}?',
      ranuras: ['tipo'],
    });

    expect(codigos(violacionesDePlantillas(archivo(...BASE, torcida), PROHIBIDOS))).toEqual([
      'ranuras_inconsistentes:torcida',
    ]);
  });

  it('rechaza una plantilla con un término de terminos-prohibidos.json [RN-23]', () => {
    const prescriptiva = item('prescriptiva', {
      texto: '¿Cuál es el mejor tratamiento para {tipo}?',
      ranuras: ['tipo'],
    });

    expect(codigos(violacionesDePlantillas(archivo(...BASE, prescriptiva), PROHIBIDOS))).toEqual([
      'termino_prohibido:prescriptiva',
    ]);
  });

  it('rechaza una plantilla con un prefijo de nivel B como recomend [RN-23]', () => {
    const recomienda = item('recomienda', {
      texto: '¿Qué se recomienda para {tipo}?',
      ranuras: ['tipo'],
    });

    expect(codigos(violacionesDePlantillas(archivo(...BASE, recomienda), PROHIBIDOS))).toContain(
      'termino_prohibido:recomienda',
    );
  });

  it('rechaza el archivo con menos de tres plantillas que solo usan el tipo', () => {
    const conTema = item('tema', {
      texto: '¿Qué evidencia hay para {tipo} en estadio {estadio}?',
      ranuras: ['tipo', 'estadio'],
    });

    expect(violacionesDePlantillas(archivo(deTipo('a'), deTipo('b'), conTema), PROHIBIDOS)).toEqual(
      [{ codigo: 'plantillas_de_tipo_insuficientes', archivo: 'plantillas' }],
    );
  });
});
