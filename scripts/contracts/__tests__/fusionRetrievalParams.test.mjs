import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as refinadoRag from '../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.ts';
import { ROOT } from './helpers/parches.mjs';

const leer = (archivo) => JSON.parse(readFileSync(path.join(ROOT, 'contracts/examples', archivo), 'utf8'));
const schema = refinadoRag.zRagQueryInternalResponseRefinado;
const conParametros = (ejemplo, cambios) => {
  const respuesta = leer(ejemplo);
  respuesta.meta.retrievalParams = { ...respuesta.meta.retrievalParams, ...cambios };
  return respuesta;
};
const campos = (resultado) => resultado.error.issues.map((incidencia) => incidencia.path.join('.'));

describe('retrievalParams con fusion y fusionParam sin nulos (US-112 AC-5, AC-6; D-c)', () => {
  it('acepta rag-query-con-evidencia en dense con fusion ninguna y fusionParam 0 [US-112 AC-6]', () => {
    expect(schema.safeParse(leer('rag-query-con-evidencia.json')).success).toBe(true);
  });

  it('acepta rag-query-hibrida con rrf y fusionParam 60 [US-112 AC-5]', () => {
    const respuesta = leer('rag-query-hibrida.json');

    expect(respuesta.meta.retrievalParams).toMatchObject({ retrievalMode: 'hibrida', fusion: 'rrf', fusionParam: 60 });
    expect(schema.safeParse(respuesta).success).toBe(true);
  });

  it('acepta la fusión ponderada con su peso [US-112 AC-6]', () => {
    expect(schema.safeParse(conParametros('rag-query-hibrida.json', { fusion: 'ponderada', fusionParam: 0.3 })).success).toBe(true);
  });

  it.each([
    ['fusion null', { fusion: null }, 'meta.retrievalParams.fusion'],
    ['fusionParam null', { fusionParam: null }, 'meta.retrievalParams.fusionParam'],
  ])('rechaza %s [US-112 AC-5]', (_nombre, cambios, campo) => {
    const resultado = schema.safeParse(conParametros('rag-query-hibrida.json', cambios));

    expect(resultado.success).toBe(false);
    expect(campos(resultado)).toContain(campo);
  });

  it('rechaza dense con fusion rrf [US-112 AC-5]', () => {
    const resultado = schema.safeParse(conParametros('rag-query-con-evidencia.json', { fusion: 'rrf', fusionParam: 60 }));

    expect(resultado.success).toBe(false);
    expect(campos(resultado).join()).toContain('fusion');
  });

  it('rechaza hibrida con fusion ninguna [US-112 AC-5]', () => {
    const resultado = schema.safeParse(conParametros('rag-query-hibrida.json', { fusion: 'ninguna', fusionParam: 0 }));

    expect(resultado.success).toBe(false);
    expect(campos(resultado).join()).toContain('fusion');
  });

  it('rechaza una respuesta a la que le faltan fusion y fusionParam [US-112 AC-5]', () => {
    const respuesta = leer('rag-query-con-evidencia.json');
    delete respuesta.meta.retrievalParams.fusion;
    delete respuesta.meta.retrievalParams.fusionParam;

    expect(schema.safeParse(respuesta).success).toBe(false);
  });
});
