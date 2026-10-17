import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProhibitedTerms } from '../src/index.js';

describe('loadProhibitedTerms', () => {
  let directorio: string;

  beforeEach(() => {
    directorio = mkdtempSync(join(tmpdir(), 'lista-terminos-'));
  });

  afterEach(() => {
    rmSync(directorio, { recursive: true, force: true });
  });

  it('carga la lista 1.2.0 con los cuatro términos de RN-23, sus equivalentes en inglés, los del Nivel A y B de S1 resp. 15 y los de S1 resp. 33 cuando se lee terminos-prohibidos.json [US-068 AC-1]', () => {
    const lista = loadProhibitedTerms();

    const textosA = lista.nivelA.terminos.map((termino) => termino.texto);
    const textosB = lista.nivelB.terminos.map((termino) => termino.texto);
    const prefijosB = lista.nivelB.prefijos.map((prefijo) => prefijo.prefijo);

    expect(lista.version).toBe('1.2.0');
    // AC-1: los cuatro de RN-23 y sus equivalentes en inglés
    expect(textosA).toEqual(
      expect.arrayContaining([
        'recomendado para este paciente',
        'debe recibir',
        'el mejor tratamiento',
        'indicado para usted',
        'recommended for this patient',
        'should receive',
        'the best treatment',
        'indicated for you',
      ]),
    );
    // S1 resp. 15 y los tres conservados de la lista provisional del Pre-S1
    expect(textosA).toEqual(
      expect.arrayContaining([
        'deben recibir',
        'debería recibir',
        'se sugiere iniciar',
        'tratamiento indicado',
        'mejor opción',
        'usted debe',
        'you should',
        'the patient should',
        'indicated for this patient',
        'probabilidad de éxito',
        'chance of success',
        'opción preferida',
        'tratamiento de elección',
        'tratamiento óptimo',
      ]),
    );
    // S1 resp. 33
    expect(textosA).toEqual(
      expect.arrayContaining([
        'inicie',
        'administre',
        'prescriba',
        'suspenda',
        'cambie a',
        'elija',
        'escoja',
        'ofrezca',
        'se debe',
        'debe iniciar',
        'debe suspender',
        'se debe administrar',
        'no debe recibir',
        'no se debe administrar',
        'es necesario',
        'es imprescindible',
        'se recomienda',
        'se recomienda iniciar',
        'se indica',
        'está indicado',
        'está contraindicado',
        'la mejor opción es',
        'manejo de elección',
        'we recommend',
        'is recommended',
        'should be started',
        'must receive',
        'should not receive',
        'is indicated',
        'is contraindicated',
        'preferred treatment',
        'treatment of choice',
      ]),
    );
    expect(lista.nivelA.terminos).toHaveLength(54);
    expect(prefijosB).toEqual(['recomend', 'recomiend', 'recommend']);
    expect(textosB).toEqual([
      'iniciar',
      'administrar',
      'prescribir',
      'suspender',
      'ofrecer',
      'elegir',
      'start',
      'initiate',
      'administer',
      'prescribe',
      'discontinue',
      'offer',
      'choose',
      'switch to',
      'standard of care',
    ]);
    expect(lista.frasesPermitidas.frases).toContain('iniciar sesión');
    const ids = [
      ...lista.nivelA.terminos.map((termino) => termino.id),
      ...lista.nivelB.terminos.map((termino) => termino.id),
      ...lista.nivelB.prefijos.map((prefijo) => prefijo.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lanza un error que nombra el archivo cuando la lista no existe o no tiene términos [US-068 AC-1]', () => {
    const inexistente = join(directorio, 'no-existe.json');
    const sinTerminos = join(directorio, 'sin-terminos.json');
    writeFileSync(sinTerminos, JSON.stringify({ version: '1.2.0', nivelA: { terminos: [] } }));

    expect(() => loadProhibitedTerms(inexistente)).toThrow(inexistente);
    expect(() => loadProhibitedTerms(sinTerminos)).toThrow(sinTerminos);
  });
});
