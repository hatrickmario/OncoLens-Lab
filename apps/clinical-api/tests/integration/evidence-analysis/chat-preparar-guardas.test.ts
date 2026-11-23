import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ejecutarComandoPreparar } from '../../../src/evaluacion/chat/comando.js';
import {
  crearPacienteSintetico,
  prepararMundoConSeed,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  datasetAlterno,
  prepararEntorno,
  type EntornoDePreparacion,
} from '../../support/preparacion-chat.js';

/**
 * US-269 (L1D-326), AC-3 y AC-6, RN-13: `eval:chat-preparar` se niega a correr con datos reales o sobre una base que no es la
 * de test sintética, antes de abrir las claves de identidad; no deja peticiones parciales y limpia el residuo de una
 * corrida interrumpida antes de cualquier otra cosa.
 */
const ESPACIO_DE_IDS = 9953;

let mundo: MundoDeGateway;
const entornos: EntornoDePreparacion[] = [];
const alternos: { limpiar: () => void }[] = [];

function nuevoEntorno(opciones: Parameters<typeof prepararEntorno>[1] = {}): EntornoDePreparacion {
  const entorno = prepararEntorno(mundo, opciones);
  entornos.push(entorno);
  return entorno;
}

const archivosEn = (directorio: string): string[] =>
  existsSync(directorio) ? readdirSync(directorio) : [];

beforeAll(async () => {
  mundo = await prepararMundoConSeed('chat_preparar_guardas', ESPACIO_DE_IDS);
});
afterAll(async () => {
  entornos.forEach((entorno) => entorno.limpiar());
  alternos.forEach((alterno) => alterno.limpiar());
  await mundo.cerrar();
});

describe('Guarda de datos reales (RN-13)', () => {
  it.each([
    ['REAL_ANONYMIZED_ENABLED', { APP_ENV: 'test', REAL_ANONYMIZED_ENABLED: 'true' }],
    ['REAL_IDENTIFIED_ENABLED', { APP_ENV: 'test', REAL_IDENTIFIED_ENABLED: 'true' }],
    ['APP_ENV', { APP_ENV: 'piloto' }],
  ])(
    'termina con código distinto de 0 nombrando %s, sin abrir las claves de identidad ni escribir peticiones [RN-13]',
    async (variable, entornoDelProceso) => {
      const entorno = nuevoEntorno({ entorno: entornoDelProceso });

      const codigo = await ejecutarComandoPreparar([], entorno.deps);

      expect(codigo).not.toBe(0);
      expect(entorno.errores()).toContain(variable);
      expect(entorno.composiciones()).toBe(0);
      expect(archivosEn(entorno.directorio)).toEqual([]);
    },
  );
});

describe('Casos que el seed no cubre', () => {
  it('nombra el caso y la clave y no deja peticiones parciales cuando el seed no tiene el hecho [US-269 AC-3]', async () => {
    const alterno = datasetAlterno(`
casos:
  - {id: CASO-OK, cancer: mama, paciente: paciente-a, pregunta: '¿Cuál es la situación actual de la paciente?', hechos_esperados: [paciente-a/her2]}
  - {id: CASO-SIN-HECHO, cancer: mama, paciente: paciente-a, pregunta: '¿Qué resultado tuvo el HER2?', hechos_esperados: [paciente-a/ca-15-3-inexistente]}
controles: []
`);
    alternos.push(alterno);
    const entorno = nuevoEntorno({ raizDelRepo: alterno.raiz });

    const codigo = await ejecutarComandoPreparar([], entorno.deps);

    expect(codigo).not.toBe(0);
    expect(entorno.errores()).toContain('CASO-SIN-HECHO');
    expect(entorno.errores()).toContain('paciente-a/ca-15-3-inexistente');
    expect(archivosEn(entorno.directorio)).toEqual([]);
  });

  it('nombra el caso y no deja peticiones parciales cuando el seed no tiene el paciente [US-269 AC-3]', async () => {
    const alterno = datasetAlterno(`
casos:
  - {id: CASO-SIN-PACIENTE, cancer: mama, paciente: paciente-zzz, pregunta: '¿Cuál es la situación actual de la paciente?', hechos_esperados: [paciente-zzz/her2]}
controles: []
`);
    alternos.push(alterno);
    const entorno = nuevoEntorno({ raizDelRepo: alterno.raiz });

    const codigo = await ejecutarComandoPreparar([], entorno.deps);

    expect(codigo).not.toBe(0);
    expect(entorno.errores()).toContain('CASO-SIN-PACIENTE');
    expect(archivosEn(entorno.directorio)).toEqual([]);
  });
});

describe('Residuo de una corrida anterior', () => {
  const dejarResiduo = (entorno: EntornoDePreparacion): string => {
    mkdirSync(entorno.directorio, { recursive: true });
    const residuo = path.join(entorno.directorio, 'RESIDUO-DE-SIGKILL.json');
    writeFileSync(residuo, '{"identidad":["sintetica"]}', 'utf8');
    return residuo;
  };

  it('borra el residuo de una corrida anterior antes de preparar [US-269 AC-6]', async () => {
    const entorno = nuevoEntorno();
    const residuo = dejarResiduo(entorno);

    const codigo = await ejecutarComandoPreparar([], entorno.deps);

    expect(codigo, entorno.errores()).toBe(0);
    expect(existsSync(residuo)).toBe(false);
    expect(archivosEn(entorno.directorio)).toHaveLength(15);
  });

  it('borra el residuo también cuando la guarda se niega a preparar [US-269 AC-6] [RN-10]', async () => {
    const entorno = nuevoEntorno({ entorno: { APP_ENV: 'piloto' } });
    const residuo = dejarResiduo(entorno);

    const codigo = await ejecutarComandoPreparar([], entorno.deps);

    expect(codigo).not.toBe(0);
    expect(existsSync(residuo)).toBe(false);
  });
});

describe('Guarda de base de test sintética (RN-13)', () => {
  it('termina con código distinto de 0 sin abrir las claves de identidad cuando la base contiene un paciente que no es del seed sintético [RN-13]', async () => {
    await crearPacienteSintetico(mundo, { conDiagnostico: false });
    const entorno = nuevoEntorno();

    const codigo = await ejecutarComandoPreparar([], entorno.deps);

    expect(codigo).not.toBe(0);
    expect(entorno.composiciones()).toBe(0);
    expect(archivosEn(entorno.directorio)).toEqual([]);
  });

  it('termina con código distinto de 0 sin abrir las claves de identidad cuando la base contiene un paciente real [RN-13]', async () => {
    await crearPacienteSintetico(mundo, { dataOrigin: 'real_anonimizado', conDiagnostico: false });
    const entorno = nuevoEntorno();

    const codigo = await ejecutarComandoPreparar([], entorno.deps);

    expect(codigo).not.toBe(0);
    expect(entorno.composiciones()).toBe(0);
  });
});
