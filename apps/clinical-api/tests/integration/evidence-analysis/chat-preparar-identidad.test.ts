import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { ejecutarComandoPreparar } from '../../../src/evaluacion/chat/comando.js';
import { prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { prepararEntorno, type EntornoDePreparacion } from '../../support/preparacion-chat.js';

/**
 * US-269 (L1D-326), AC-6 y RN-11: la petición preparada de la pregunta con el marcador de identidad sale desidentificada,
 * y cada petición lleva su propio seudónimo. La identidad sintética se lee del seed (`prisma/seed/pacientes/chat.ts`).
 */
const ESPACIO_DE_IDS = 9952;

interface ArchivoPreparado {
  peticion: { pseudoPatientId: string; question: string };
  identidad: string[];
}

let mundo: MundoDeGateway;
let entorno: EntornoDePreparacion;

const leer = (id: string): { texto: string; archivo: ArchivoPreparado } => {
  const texto = readFileSync(path.join(entorno.directorio, `${id}.json`), 'utf8');
  return { texto, archivo: JSON.parse(texto) as ArchivoPreparado };
};

beforeAll(async () => {
  mundo = await prepararMundoConSeed('chat_preparar_identidad', ESPACIO_DE_IDS);
  entorno = prepararEntorno(mundo);
  await ejecutarComandoPreparar([], entorno.deps);
});
afterAll(async () => {
  entorno.limpiar();
  await mundo.cerrar();
});

describe('Petición preparada de CHAT-AC01-MAMA-PII', () => {
  it('no lleva nombre, documento ni fecha de nacimiento de P-CHAT, ni el marcador sin resolver [US-269 AC-6]', () => {
    const { texto, archivo } = leer('CHAT-AC01-MAMA-PII');

    const peticion = JSON.stringify(archivo.peticion);
    for (const prohibido of [
      NOMBRE_SINTETICO_CHAT,
      DOCUMENTO_SINTETICO_CHAT,
      NACIMIENTO_SINTETICO_CHAT,
      '{identidad_sintetica',
    ]) {
      expect(peticion, prohibido).not.toContain(prohibido);
    }
    expect(archivo.peticion.question.length).toBeGreaterThan(0);
    expect(texto).toContain('identidad');
  });

  it('lleva en identidad los textos sintéticos que la suite debe contar, solo en el archivo preparado [US-269 AC-6] [RN-10]', () => {
    const { archivo } = leer('CHAT-AC01-MAMA-PII');

    expect(archivo.identidad).toEqual(
      expect.arrayContaining([
        NOMBRE_SINTETICO_CHAT,
        DOCUMENTO_SINTETICO_CHAT,
        NACIMIENTO_SINTETICO_CHAT,
      ]),
    );
  });

  it('usa un seudónimo distinto en cada petición preparada [RN-11]', () => {
    const seudonimos = readdirSync(entorno.directorio).map(
      (nombre) => leer(path.basename(nombre, '.json')).archivo.peticion.pseudoPatientId,
    );

    expect(seudonimos.length).toBeGreaterThan(1);
    expect(new Set(seudonimos).size).toBe(seudonimos.length);
  });
});
