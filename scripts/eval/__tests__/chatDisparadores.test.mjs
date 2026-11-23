/**
 * Los directorios del chat disparan `eval-required` (US-269, L1D-326): un cambio en el dataset `chat-v1`, en la familia `chat` o
 * en los nodos del grafo del chat ejecuta la suite `evaluate`. Lee las reglas reales de `scripts/ci/eval-trigger-paths.yaml`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { tocaDisparador } from '../../ci/eval-trigger.mjs';

const REGLAS = YAML.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../ci/eval-trigger-paths.yaml'), 'utf8'),
);

describe('disparadores del chat en eval-trigger-paths.yaml', () => {
  it.each([
    'data/eval/chat-v1/casos.yaml',
    'apps/rag-orchestrator/app/evaluation/chat.py',
    'apps/rag-orchestrator/app/evaluation/dataset_chat.py',
    'apps/rag-orchestrator/app/application/chat/grafo.py',
    'apps/rag-orchestrator/app/application/chat/capacidades/relevancia_del_dato.py',
    'apps/rag-orchestrator/app/prompts/chat_caso.py',
    'apps/rag-orchestrator/eval/configs/chat-local.yaml',
  ])('dispara cuando el diff modifica %s [US-269 AC-3]', (ruta) => {
    const resultado = tocaDisparador([{ ruta, lineas: ['+cambio'] }], REGLAS);

    expect(resultado.dispara).toBe(true);
  });

  it('no dispara cuando el diff solo modifica el comando de preparación de clinical-api [US-269 AC-3]', () => {
    const resultado = tocaDisparador(
      [{ ruta: 'apps/clinical-api/src/evaluacion/chat/reglas.ts', lineas: ['+cambio'] }],
      REGLAS,
    );

    expect(resultado.dispara).toBe(false);
  });
});
