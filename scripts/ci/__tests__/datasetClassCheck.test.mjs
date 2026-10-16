import { describe, expect, it } from 'vitest';
import { datasetsSinClase } from '../dataset-class-check.mjs';
import { declaraClaseEnCabecera, declaraClaseSintetico, esMarcaSintetica, manifiestoMasCercano } from '../lib/claseDatos.mjs';

const RAICES = ['data/eval/', 'data/evaluation/'];
const leerDe = (archivos) => (ruta) => (ruta in archivos ? archivos[ruta] : null);
const verificar = (archivos) => datasetsSinClase({ archivos: Object.keys(archivos), raices: RAICES, leerArchivo: leerDe(archivos) });

describe('datasetsSinClase', () => {
  it('falla con dataset sin clase de datos sintetico cuando no hay manifiesto [US-036 AC-5]', () => {
    expect(verificar({ 'data/evaluation/preguntas.jsonl': '{"q":1}' })).toEqual(['data/evaluation/preguntas.jsonl']);
  });

  it('pasa cuando el manifiesto más cercano declara clase sintetico [US-036 AC-5]', () => {
    const archivos = { 'data/eval/mini/manifest.json': '{"clase":"sintetico"}', 'data/eval/mini/golden.yaml': 'a: 1', 'data/eval/mini/sub/pares.yaml': 'b: 2' };

    expect(verificar(archivos)).toEqual([]);
  });

  it('falla cuando el manifiesto más cercano declara otra clase aunque un manifiesto más lejano diga sintetico [US-036 AC-5]', () => {
    const archivos = {
      'data/eval/manifest.yaml': 'clase: sintetico',
      'data/eval/real/manifest.yaml': 'clase: real_anonimizado',
      'data/eval/real/casos.jsonl': '{}',
    };

    expect(verificar(archivos)).toEqual(['data/eval/real/manifest.yaml', 'data/eval/real/casos.jsonl']);
  });

  it('pasa cuando el propio archivo declara la clase en su cabecera [US-036 AC-5]', () => {
    expect(verificar({ 'data/eval/particion.yaml': 'clase: sintetico\nversion: 1' })).toEqual([]);
  });

  it('falla cuando un manifiesto es ilegible y el archivo no declara la clase [US-036 AC-5]', () => {
    const archivos = { 'data/eval/x/manifest.json': '{ no es json', 'data/eval/x/datos.csv': 'a,b' };

    expect(verificar(archivos)).toEqual(['data/eval/x/manifest.json', 'data/eval/x/datos.csv']);
  });

  it('ignora los archivos fuera de las raíces de evaluación [US-036 AC-5]', () => {
    expect(verificar({ 'data/raw/seed/guia.txt': 'texto', 'docs/datos.csv': 'a' })).toEqual([]);
  });

  it('falla con un .md y un .py de datos sin clase porque ninguna extensión está exenta [US-036 AC-5]', () => {
    const archivos = { 'data/eval/p/README.md': '# p', 'data/eval/p/generar.py': 'print(1)' };

    expect(verificar(archivos)).toEqual(['data/eval/p/README.md', 'data/eval/p/generar.py']);
  });

  it('cubre un README con el manifiesto sintetico de su directorio [US-036 AC-5]', () => {
    expect(verificar({ 'data/eval/p/manifest.yaml': 'clase: sintetico', 'data/eval/p/README.md': '# p' })).toEqual([]);
  });

  it('falla cuando el manifiesto más cercano declara otra clase aunque la cabecera del archivo diga sintetico [US-036 AC-5]', () => {
    const archivos = { 'data/eval/r/manifest.yaml': 'clase: real_anonimizado', 'data/eval/r/casos.yaml': 'clase: sintetico' };

    expect(verificar(archivos)).toContain('data/eval/r/casos.yaml');
  });

  it('no sube más arriba de la raíz configurada en busca de un manifiesto [US-036 AC-5]', () => {
    const archivos = { 'data/manifest.yaml': 'clase: sintetico', 'data/eval/a.jsonl': '{}' };

    expect(verificar(archivos)).toEqual(['data/eval/a.jsonl']);
  });
});

describe('manifiestoMasCercano', () => {
  it('sube por los directorios hasta encontrar un manifest.yaml [US-036 AC-5]', () => {
    const encontrado = manifiestoMasCercano('data/eval/a/b/c.json', leerDe({ 'data/eval/manifest.yaml': 'clase: sintetico' }));

    expect(encontrado.ruta).toBe('data/eval/manifest.yaml');
  });

  it('se detiene en la raíz indicada aunque haya un manifiesto más arriba [US-036 AC-5]', () => {
    const leer = leerDe({ 'data/manifest.yaml': 'clase: sintetico' });

    expect(manifiestoMasCercano('data/eval/a.json', leer, 'data/eval/')).toBeNull();
  });

  it('devuelve null cuando ningún directorio tiene manifiesto [US-036 AC-5]', () => {
    expect(manifiestoMasCercano('data/eval/a.json', leerDe({}))).toBeNull();
  });
});

describe('declaraClaseSintetico', () => {
  it.each([
    ['clase: sintetico en YAML', 'clase: sintetico', true],
    ['clase sintetico en JSON', '{"clase":"sintetico"}', true],
    ['la marca literal sintetico: true de AC-4', '{"sintetico": true}', true],
    ['otra clase de datos', 'clase: real_anonimizado', false],
    ['un manifiesto vacío', '', false],
  ])('evalúa %s [US-036 AC-5]', (_descripcion, contenido, esperado) => {
    expect(declaraClaseSintetico({ contenido })).toBe(esperado);
  });
});

describe('declaraClaseEnCabecera', () => {
  it.each([
    ['una línea clase: sintetico', 'clase: sintetico\nx: 1', true],
    ['un JSONL con clase en la primera línea', '{"clase":"sintetico"}\n{"q":1}', true],
    ['un comentario con la marca', '# clase: sintetico\n', true],
    ['un archivo sin marca', 'x: 1', false],
    ['la clase mencionada más allá de la cabecera', `${'x'.repeat(3000)}\nclase: sintetico`, false],
  ])('evalúa %s [US-036 AC-5]', (_descripcion, texto, esperado) => {
    expect(declaraClaseEnCabecera(texto)).toBe(esperado);
  });
});

describe('esMarcaSintetica', () => {
  it.each([
    [{ clase: 'sintetico' }, true],
    [{ sintetico: true }, true],
    [{ clase: 'real_anonimizado' }, false],
    [{ sintetico: 'true' }, false],
    [undefined, false],
  ])('evalúa %j [US-036 AC-5]', (objeto, esperado) => {
    expect(esMarcaSintetica(objeto)).toBe(esperado);
  });
});
