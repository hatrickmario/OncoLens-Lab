import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { check } from '../../check.mjs';
import { loadContext } from '../../io.mjs';
import { TRANSPORTES_DECLARADOS, assertConsumersUseGeneratedClients } from '../../rules/assertConsumersUseGeneratedClients.mjs';
import { ROOT } from '../helpers/parches.mjs';

const ARCHIVO_TRANSPORTE = TRANSPORTES_DECLARADOS[0].file;
const LLAMADA_DECLARADA = TRANSPORTES_DECLARADOS[0].llamada;

/** Hallazgos de la regla sobre el código de consumidores dado (más el transporte declarado intacto, salvo que se pise). */
const hallazgosDe = (consumers) =>
  assertConsumersUseGeneratedClients(null, null, { consumers: { [ARCHIVO_TRANSPORTE]: `return ${LLAMADA_DECLARADA}url, init);`, ...consumers } });

describe('assertConsumersUseGeneratedClients · clientes generados como única vía [US-214 AC-1]', () => {
  it('no reporta nada sobre el código real y lo encuentra: la regla no pasa en vacío [US-214 AC-1]', async () => {
    const { docs } = await loadContext(ROOT);

    expect(Object.keys(docs.consumers)).toEqual(expect.arrayContaining([ARCHIVO_TRANSPORTE, 'apps/clinical-api/src/infrastructure/rag-orchestrator.client.ts', 'apps/web/components/organisms/login-form.tsx']));
    expect(Object.keys(docs.consumers).some((file) => /\.test\.|__tests__|\/tests\//.test(file))).toBe(false);
    expect(assertConsumersUseGeneratedClients(null, null, docs)).toEqual([]);
  });

  it('nombra el archivo y la línea cuando clinical-api llama con fetch a rag-orchestrator [US-214 AC-1]', () => {
    const [hallazgo, ...otros] = hallazgosDe({ 'apps/clinical-api/src/infrastructure/fuga.ts': "const a = 1;\nconst r = await fetch('http://rag-orchestrator:8000/rag/query', { method: 'POST' });\n" });

    expect(otros).toEqual([]);
    expect(hallazgo).toMatchObject({ file: 'apps/clinical-api/src/infrastructure/fuga.ts', path: 'L2', rule: 'assertConsumersUseGeneratedClients' });
    expect(hallazgo.message).toContain('fetch(...)');
  });

  it.each([
    ["import axios from 'axios';", 'axios'],
    ["import { request } from 'undici';", 'import de un cliente HTTP'],
    ["import https from 'node:https';", 'import de node:http(s)'],
    ["const cliente = require('node-fetch');", 'require de un cliente HTTP'],
    ['const respuesta = await globalThis.fetch(url);', '<objeto>.fetch(...)'],
    ['http.request(opciones, alResponder);', 'http(s).request/get(...)'],
    ['const x = new XMLHttpRequest();', 'XMLHttpRequest'],
  ])('reporta «%s» como %s [US-214 AC-1]', (linea, forma) => {
    const hallazgos = hallazgosDe({ 'apps/web/lib/server/otra.ts': `${linea}\n` });

    expect(hallazgos.map((item) => item.message)).toEqual([expect.stringContaining(forma)]);
  });

  it('acepta el fetch del navegador hacia el BFF de su propio origen y las menciones en comentarios [US-214 AC-1]', () => {
    const hallazgos = hallazgosDe({
      'apps/web/components/organisms/formulario.tsx': "const r = await fetch('/api/auth/login', { method: 'POST' });\n// llamar con fetch(url) directo está prohibido\n * y axios tampoco\n",
    });

    expect(hallazgos).toEqual([]);
  });

  it('acepta la llamada declarada solo en su archivo y en su línea [US-214 AC-1]', () => {
    expect(hallazgosDe({})).toEqual([]);
    expect(hallazgosDe({ 'apps/web/lib/server/otra.ts': `return ${LLAMADA_DECLARADA}url);\n` })).toHaveLength(1);
  });

  it('sigue reportando un fetch directo a rag-orchestrator escrito en el archivo del transporte declarado [US-214 AC-1]', () => {
    const hallazgos = hallazgosDe({ [ARCHIVO_TRANSPORTE]: `return ${LLAMADA_DECLARADA}url, init);\nawait fetch('http://rag-orchestrator:8000/rag/query');\n` });

    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatchObject({ file: ARCHIVO_TRANSPORTE, path: 'L2' });
  });

  it('reporta el transporte declarado que ya no contiene su llamada, para que la lista blanca no dé cobertura a otro código [US-214 AC-1]', () => {
    const hallazgos = hallazgosDe({ [ARCHIVO_TRANSPORTE]: 'export const nada = 1;\n' });

    expect(hallazgos.map((item) => item.message)).toEqual([expect.stringContaining('ya no contiene')]);
  });

  it('no reporta nada cuando no hay código de consumidores que revisar (contexto sin cargar)', () => {
    expect(assertConsumersUseGeneratedClients(null, null, {})).toEqual([]);
    expect(assertConsumersUseGeneratedClients(null, null, { consumers: {} })).toEqual([]);
  });
});

describe('contracts:check con un fetch directo en clinical-api', () => {
  const temporales = [];
  afterEach(async () => {
    await Promise.all(temporales.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('devuelve un hallazgo que nombra el archivo y la línea cuando un archivo de clinical-api llama con fetch a rag-orchestrator [US-214 AC-1]', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'oncolens-consumidores-'));
    temporales.push(dir);
    for (const entrada of ['apps/clinical-api/openapi.yaml', 'apps/rag-orchestrator/openapi.yaml', 'contracts', 'docs/architecture/data-model.md', 'readme.md', ARCHIVO_TRANSPORTE]) {
      await mkdir(path.dirname(path.join(dir, entrada)), { recursive: true });
      await cp(path.join(ROOT, entrada), path.join(dir, entrada), { recursive: true });
    }
    await mkdir(path.join(dir, 'apps/clinical-api/src'), { recursive: true });
    await writeFile(path.join(dir, 'apps/clinical-api/src/fuga.ts'), "export const llamar = () => fetch('http://rag-orchestrator:8000/rag/query');\n");

    const hallazgos = (await check(dir)).filter((item) => item.rule === 'assertConsumersUseGeneratedClients');

    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0]).toMatchObject({ file: 'apps/clinical-api/src/fuga.ts', path: 'L1' });
  }, 60_000);
});
