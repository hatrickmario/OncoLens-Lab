import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ragCatalogo from '../../../../../contracts/examples/rag-catalog-version-mismatch.json' with { type: 'json' };
import ragConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import errorCatalogo from '../../../../../contracts/examples/error-catalog-version-mismatch.json' with { type: 'json' };
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarRegistrosPorTrace,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  versionDelCatalogo,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 171;
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_catalogo_version', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-sesion-catalogo-0001');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const gateway = (traceId: string) => montarGateway(mundo, { traceIds: { traceId: () => traceId } });

async function solicitar(app: Awaited<ReturnType<typeof gateway>>['app']) {
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({
      patientId: idDePaciente('a'),
      query: PREGUNTA_Q_HER2,
      sourcesSelected: TODAS_LAS_FUENTES,
    });
}

describe('versión del catálogo clínico entre backends', () => {
  it('responde 200 y persiste catalog_version 1.0.0 cuando ambos backends montan 1.0.0 [US-041 AC-1]', async () => {
    rag.responder({
      tipo: 'json',
      status: 200,
      cuerpo: { ...ragConEvidencia, meta: { ...ragConEvidencia.meta, catalogVersion: '1.0.0' } },
    });
    const { app } = await gateway('req_Catalogo0001');

    const respuesta = await solicitar(app);

    expect(respuesta.status).toBe(200);
    expect(versionDelCatalogo()).toBe('1.0.0');
    expect(rag.capturadas[0]!.cuerpo['catalogVersion']).toBe('1.0.0');
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Catalogo0001');
    expect(fila?.catalog_version).toBe('1.0.0');
  });

  it('responde 409 CATALOG_VERSION_MISMATCH sin persistir registro cuando rag-orchestrator responde 409 de catálogo [US-041 AC-2]', async () => {
    rag.responder({ tipo: 'json', status: 409, cuerpo: ragCatalogo });
    const { app } = await gateway('req_Catalogo0002');

    const respuesta = await solicitar(app);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toEqual({
      error: 'CATALOG_VERSION_MISMATCH',
      message: errorCatalogo.message,
      traceId: 'req_Catalogo0002',
    });
    expect(await contarRegistrosPorTrace(mundo.cliente, 'req_Catalogo0002')).toBe(0);
  });

  it('sigue respondiendo 502 sin registro cuando el 409 de rag-orchestrator trae otro código [US-041 AC-2]', async () => {
    rag.responder({
      tipo: 'json',
      status: 409,
      cuerpo: { ...ragCatalogo, error: 'OTRO_CONFLICTO' },
    });
    const { app } = await gateway('req_Catalogo0003');

    const respuesta = await solicitar(app);

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(await contarRegistrosPorTrace(mundo.cliente, 'req_Catalogo0003')).toBe(0);
  });
});
