import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import {
  prepararPeticionesDeChat,
  type ResultadoDeLaPreparacion,
} from '../../../scripts/chat-preparar/preparar.js';
import {
  abrirSesion,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

/**
 * US-269 (L1D-326), `eval:chat-preparar`: el paso de `clinical-api` de la suite `evaluate` del chat arma las peticiones
 * con el pipeline de producción sobre el seed sintético (BD de test), mide los faltantes y no escribe identidad.
 */
const ESPACIO_DE_IDS = 9872;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-chat-evaluate-preparar-0001';
const DATASET = resolve(import.meta.dirname, '../../../../../data/eval/chat-v1');
const ID_DEL_CASO_CON_IDENTIDAD = 'CHAT-AC01-MAMA-PII';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let salida: string;
let cookie: string;
let preparacion: Promise<ResultadoDeLaPreparacion> | undefined;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_chat_evaluate_preparar', ESPACIO_DE_IDS);
  salida = mkdtempSync(join(tmpdir(), 'chat-preparar-'));
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
  rmSync(salida, { recursive: true, force: true });
});

/** La preparación corre una sola vez y la comparten los tests del archivo. */
const preparar = (): Promise<ResultadoDeLaPreparacion> => {
  preparacion ??= prepararPeticionesDeChat({ mundo, rag, cookie, dataset: DATASET, salida });
  return preparacion;
};

const idsDelDataset = (): string[] => {
  const { casos, controles } = parse(readFileSync(join(DATASET, 'casos.yaml'), 'utf8')) as {
    casos: { id: string }[];
    controles: { id: string }[];
  };
  return [...casos, ...controles].map((c) => c.id);
};

describe('eval:chat-preparar sobre el seed sintético', () => {
  it('publica sensibilidad, especificidad y exactitud de gapType 4/4 para P-CHAT con FX-12-c [US-269 AC-4]', async () => {
    const resultado = await preparar();

    expect(resultado.faltantes['paciente-chat']).toEqual({
      esperados: 4,
      sensibilidad: 1,
      especificidad: 1,
      gapType: { correctos: 4, total: 4 },
    });
  });

  it('resuelve el marcador de identidad y escribe peticiones desidentificadas [US-269 AC-6]', async () => {
    await preparar();
    expect(readdirSync(salida).sort()).toEqual(
      idsDelDataset()
        .map((id) => `${id}.json`)
        .sort(),
    );
    const texto = readFileSync(join(salida, `${ID_DEL_CASO_CON_IDENTIDAD}.json`), 'utf8');
    const caso = JSON.parse(texto) as {
      peticion: { question: string };
      hechosPorClave: Record<string, string>;
      identidad: string[];
    };

    expect(caso.identidad).toEqual([
      NOMBRE_SINTETICO_CHAT,
      DOCUMENTO_SINTETICO_CHAT,
      NACIMIENTO_SINTETICO_CHAT,
    ]);
    expect(caso.peticion.question).toContain('[REDACTADO]');
    expect(caso.hechosPorClave['paciente-chat/diagnostico-iia']).toMatch(/^f\d+$/);
    expect(texto).not.toContain(NOMBRE_SINTETICO_CHAT);
    expect(texto).not.toContain(DOCUMENTO_SINTETICO_CHAT);
    expect(texto).not.toContain(NACIMIENTO_SINTETICO_CHAT);
    expect(texto).not.toContain('{identidad_sintetica');
  });
});
