import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { zChatTurnRequest } from '../../../../../packages/api-contracts/src/zod/rag-orchestrator/zod.gen.js';
import { ejecutarComandoPreparar } from '../../../src/evaluacion/chat/comando.js';
import { prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import {
  RAIZ_DEL_REPO,
  RUTA_DEL_DATASET,
  prepararEntorno,
  type EntornoDePreparacion,
} from '../../support/preparacion-chat.js';

/**
 * US-269 (L1D-326), AC-3 y AC-6: `eval:chat-preparar` arma con el servicio de conversación de producción la petición de
 * cada caso y control de `chat-v1` sobre la BD de test con el seed sintético, y la deja en un directorio no versionado.
 */
const ESPACIO_DE_IDS = 9951;

interface CasoDelDataset {
  id: string;
  hechos_esperados?: string[];
}
interface Dataset {
  casos: CasoDelDataset[];
  controles: CasoDelDataset[];
}
interface ArchivoPreparado {
  peticion: { caseFacts: { factRef: string; kind: string; verbalization: string }[] };
  hechosPorClave: Record<string, string>;
  identidad: string[];
}

const dataset = parse(readFileSync(path.join(RUTA_DEL_DATASET, 'casos.yaml'), 'utf8')) as Dataset;
const todos = [...dataset.casos, ...dataset.controles];

let mundo: MundoDeGateway;
let entorno: EntornoDePreparacion;

function leerArchivo(id: string): ArchivoPreparado {
  return JSON.parse(readFileSync(path.join(entorno.directorio, `${id}.json`), 'utf8'));
}

beforeAll(async () => {
  mundo = await prepararMundoConSeed('chat_preparar_peticiones', ESPACIO_DE_IDS);
  entorno = prepararEntorno(mundo);
});
afterAll(async () => {
  entorno.limpiar();
  await mundo.cerrar();
});

describe('eval:chat-preparar sobre la BD de test con el seed sintético', () => {
  it('escribe una petición que cumple ChatTurnRequest por cada caso y control, con los hechos esperados traducidos a factRefs de esa petición [US-269 AC-3]', async () => {
    const codigo = await ejecutarComandoPreparar([], entorno.deps);

    expect(codigo, entorno.errores()).toBe(0);
    expect(readdirSync(entorno.directorio).sort()).toEqual(
      todos.map(({ id }) => `${id}.json`).sort(),
    );
    for (const caso of todos) {
      const archivo = leerArchivo(caso.id);
      expect(zChatTurnRequest.safeParse(archivo.peticion).success, caso.id).toBe(true);
      expect(Object.keys(archivo.hechosPorClave).sort(), caso.id).toEqual(
        [...(caso.hechos_esperados ?? [])].sort(),
      );
      const factRefs = new Set(archivo.peticion.caseFacts.map((hecho) => hecho.factRef));
      for (const factRef of Object.values(archivo.hechosPorClave)) {
        expect(factRefs.has(factRef), `${caso.id} ${factRef}`).toBe(true);
      }
    }
  });

  it('traduce cada clave del seed al hecho de su clase y su dato cuando el caso espera un biomarcador, un diagnóstico y un tratamiento [US-269 AC-3]', async () => {
    await ejecutarComandoPreparar([], entorno.deps);

    const mama = leerArchivo('CHAT-AC01-MAMA');
    const hecho = (archivo: ArchivoPreparado, clave: string) =>
      archivo.peticion.caseFacts.find((f) => f.factRef === archivo.hechosPorClave[clave]);
    expect(hecho(mama, 'paciente-a/her2')).toMatchObject({ kind: 'biomarcador' });
    expect(hecho(mama, 'paciente-a/her2')?.verbalization).toContain('HER2');
    expect(hecho(mama, 'paciente-a/diagnostico-1')).toMatchObject({ kind: 'diagnostico' });
    const prostata = leerArchivo('CHAT-AC01-PROSTATA');
    expect(hecho(prostata, 'paciente-b/psa-3')).toMatchObject({ kind: 'biomarcador' });
    expect(hecho(prostata, 'paciente-b/progresion-bioquimica')).toMatchObject({ kind: 'evento' });
    expect(hecho(leerArchivo('CHAT-AC02-PROSTATA'), 'paciente-b/adt')).toMatchObject({
      kind: 'tratamiento',
    });
  });

  it('no deja ningún archivo preparado bajo el .gitignore de la raíz sin ignorar [US-269 AC-6] [RN-10]', () => {
    const ignorado = execFileSync(
      'git',
      ['check-ignore', 'apps/clinical-api/eval/results/tmp/CHAT-AC01-MAMA.json'],
      { cwd: RAIZ_DEL_REPO, encoding: 'utf8' },
    );

    expect(ignorado.trim()).toBe('apps/clinical-api/eval/results/tmp/CHAT-AC01-MAMA.json');
  });
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const RECURSOS_DEL_PACIENTE = `
  SELECT id FROM clinical.patient WHERE id = $1
  UNION ALL SELECT id FROM clinical.care_episode WHERE patient_id = $1
  UNION ALL SELECT id FROM clinical.diagnosis WHERE patient_id = $1
  UNION ALL SELECT id FROM clinical.exam WHERE patient_id = $1
  UNION ALL SELECT b.id FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1
  UNION ALL SELECT id FROM clinical.prior_treatment WHERE patient_id = $1
  UNION ALL SELECT id FROM clinical.clinical_event WHERE patient_id = $1
  UNION ALL SELECT id FROM clinical.clinical_attribute WHERE patient_id = $1
  UNION ALL SELECT id FROM clinical.clinical_note WHERE patient_id = $1
  UNION ALL SELECT id FROM clinical.document WHERE patient_id = $1`;

describe('hechosPorClave de las peticiones preparadas', () => {
  it('lleva solo claves semánticas y factRefs, sin ningún identificador de recurso de Backend 1 ni el mapa factRef a recurso [US-269 AC-6] [RN-10]', async () => {
    await ejecutarComandoPreparar([], entorno.deps);
    const { rows: pacientes } = await mundo.cliente.query<{ id: string }>(
      'SELECT id FROM clinical.patient',
    );
    const recursos = new Set<string>();
    for (const { id } of pacientes) {
      const { rows } = await mundo.cliente.query<{ id: string }>(RECURSOS_DEL_PACIENTE, [id]);
      rows.forEach((fila) => recursos.add(fila.id));
    }
    expect(recursos.size).toBeGreaterThan(pacientes.length);

    for (const caso of todos) {
      const texto = readFileSync(path.join(entorno.directorio, `${caso.id}.json`), 'utf8');
      const presentes = (texto.match(UUID) ?? []).filter((uuid) => recursos.has(uuid));
      expect(presentes, caso.id).toEqual([]);
      const { hechosPorClave } = leerArchivo(caso.id);
      for (const valor of Object.values(hechosPorClave)) expect(valor).toMatch(/^f\d+$/);
    }
  });
});
