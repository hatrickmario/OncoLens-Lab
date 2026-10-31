import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as refinadoRag from '../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.ts';
import { ROOT } from './helpers/parches.mjs';

const leer = (archivo) => JSON.parse(readFileSync(path.join(ROOT, 'contracts/examples', archivo), 'utf8'));
const schema = refinadoRag.zRagQueryInternalResponseRefinado;
const conReescritura = (ejemplo, queryRewrite) => {
  const respuesta = leer(ejemplo);
  respuesta.meta.retrievalParams = { ...respuesta.meta.retrievalParams, queryRewrite };
  return respuesta;
};

describe('retrievalParams.queryRewrite sin nulos (US-238, D6)', () => {
  it.each([
    ['rag-query-con-evidencia.json', { applied: false, reason: 'no_disparado' }],
    ['rag-query-sin-evidencia.json', { applied: true, reason: 'disparado' }],
    ['rag-query-reescritura-aplicada.json', { applied: true, reason: 'disparado' }],
  ])('acepta el ejemplo %s con su queryRewrite [US-238 AC-1]', (archivo, esperado) => {
    const respuesta = leer(archivo);

    expect(respuesta.meta.retrievalParams.queryRewrite).toEqual(esperado);
    expect(schema.safeParse(respuesta).success).toBe(true);
  });

  it.each([
    ['no_disponible', false],
    ['no_aplica', false],
  ])('acepta applied false con reason %s', (reason, applied) => {
    expect(schema.safeParse(conReescritura('rag-query-con-evidencia.json', { applied, reason })).success).toBe(true);
  });

  it.each([
    ['reason null', { applied: false, reason: null }],
    ['queryRewrite null', null],
    ['applied true con no_disparado', { applied: true, reason: 'no_disparado' }],
    ['applied false con disparado', { applied: false, reason: 'disparado' }],
    ['reason fuera del enum', { applied: false, reason: 'otro' }],
    ['campo extra', { applied: false, reason: 'no_disparado', consulta: 'texto' }],
  ])('rechaza %s', (_nombre, queryRewrite) => {
    expect(schema.safeParse(conReescritura('rag-query-con-evidencia.json', queryRewrite)).success).toBe(false);
  });

  it('rechaza retrievalParams sin queryRewrite', () => {
    const respuesta = leer('rag-query-con-evidencia.json');
    delete respuesta.meta.retrievalParams.queryRewrite;

    expect(schema.safeParse(respuesta).success).toBe(false);
  });
});
