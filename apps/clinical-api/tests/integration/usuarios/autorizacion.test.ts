import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  PREGUNTA_AC1,
  PUNTERO_200,
  PUNTERO_403,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { permisosDocumentadosDe } from '../../support/matriz-de-permisos.js';
import { abrirSesionDeUsuarioConRol, crearRolDePrueba } from '../../support/roles.js';
import {
  incoherencias,
  leerOperacionesDelContrato,
  operacionDeLaRuta,
  rutasMontadas,
} from '../../support/rutas-y-contrato.js';
import { contrasenaDeTest } from '../../support/usuarios.js';

const ESPACIO_DE_IDS = 305;
const PACIENTE_A = idDePaciente('b');
const hashDe = (token: string) => createHash('sha256').update(token).digest('hex');
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookieLector: string;
let cookieAnalista: string;
let cookieAdmin: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('autorizacion', ESPACIO_DE_IDS);
  // Rol `lectura`: solo patients:lookup (FX-T4a-b). Rol `analista`: solo ai_analysis:create y NO se llama doctor.
  const lectura = await crearRolDePrueba(mundo.cliente, mundo.ids, 'lectura', ['patients:lookup']);
  const analista = await crearRolDePrueba(mundo.cliente, mundo.ids, 'analista', [
    'ai_analysis:create',
  ]);
  const tokenLector = 'tokenSinteticoLectorAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const tokenAnalista = 'tokenSinteticoAnalistaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  cookieLector = (
    await abrirSesionDeUsuarioConRol(mundo.cliente, mundo.ids, {
      email: 'lector@test.local',
      password: contrasenaDeTest('TEST_DOC1_PASSWORD'),
      rolId: lectura,
      token: tokenLector,
      tokenHash: hashDe(tokenLector),
    })
  ).cookie;
  cookieAnalista = (
    await abrirSesionDeUsuarioConRol(mundo.cliente, mundo.ids, {
      email: 'analista@test.local',
      password: contrasenaDeTest('TEST_DOC2_PASSWORD'),
      rolId: analista,
      token: tokenAnalista,
      tokenHash: hashDe(tokenAnalista),
    })
  ).cookie;
  cookieAdmin = await abrirSesion(mundo, 'admin@test.local', 'SINT-cookie-admin-autorizacion-0001');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const cuerpo = {
  patientId: PACIENTE_A,
  query: PREGUNTA_AC1,
  sourcesSelected: TODAS_LAS_FUENTES,
};

async function analisisPersistidos(): Promise<number> {
  const { rows } = await mundo.cliente.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM clinical.ai_analysis_record',
  );
  return rows[0]?.n ?? 0;
}

describe('autorización por permiso', () => {
  it('responde 403 y rag-orchestrator registra cero llamadas cuando un rol sin ai_analysis:create pide un análisis [US-045 AC-3]', async () => {
    const { app } = await montarGateway(mundo);
    const antes = await analisisPersistidos();

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieLector)
      .send(cuerpo);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    assertMatchesSpec('clinical-api', PUNTERO_403, respuesta.body);
    expect(rag.llamadas()).toBe(0);
    expect(await analisisPersistidos()).toBe(antes);
  });

  it('responde 200 cuando un rol que no se llama doctor tiene ai_analysis:create, porque se autoriza por permiso y no por rol', async () => {
    const { app } = await montarGateway(mundo);

    const respuesta = await request(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookieAnalista)
      .send(cuerpo);

    expect(respuesta.status).toBe(200);
    assertMatchesSpec('clinical-api', PUNTERO_200, respuesta.body);
    expect(rag.llamadas()).toBe(1);
  });

  it('usa en authorize() exactamente el x-permission de su operación en toda ruta montada [US-045 AC-3]', async () => {
    const { rutas } = await montarGateway(mundo);

    expect(rutasMontadas(rutas).length).toBeGreaterThan(0);
    expect(incoherencias(rutas)).toEqual([]);
  });

  it('responde 403 en el análisis y en toda operación montada que el admin no puede ejecutar, sin llamar a rag-orchestrator [US-045 AC-6]', async () => {
    const { app, rutas } = await montarGateway(mundo);
    const operaciones = leerOperacionesDelContrato();
    const { rows } = await mundo.cliente.query<{ code: string }>(
      `SELECT p.code FROM auth.role r
         JOIN auth.role_permission rp ON rp.role_id = r.id
         JOIN auth.permission p ON p.id = rp.permission_id
        WHERE r.name = 'admin'`,
    );
    const delAdmin = new Set(rows.map((fila) => fila.code));
    const vedadas = rutasMontadas(rutas)
      .map((montada) => ({ montada, operacion: operacionDeLaRuta(montada, operaciones) }))
      .filter(({ operacion }) => operacion?.permisos.every((codigo) => !delAdmin.has(codigo)));
    expect(vedadas.map(({ operacion }) => operacion?.operationId)).toContain(
      'createEvidenceAnalysis',
    );

    for (const { montada, operacion } of vedadas) {
      const ruta = montada.ruta.replace(/\{\w+\}/g, PACIENTE_A);
      const respuesta = await request(app)
        [montada.metodo as 'post'](ruta)
        .set('Cookie', cookieAdmin)
        .send(cuerpo);

      expect(respuesta.status, operacion?.operationId).toBe(403);
      const puntero = `#/paths/${montada.ruta.replaceAll('/', '~1')}/${montada.metodo}/responses/403`;
      assertMatchesSpec('clinical-api', puntero, respuesta.body);
    }
    expect(rag.llamadas()).toBe(0);
  });

  async function permisosSembradosDe(rol: string): Promise<string[]> {
    const { rows } = await mundo.cliente.query<{ code: string }>(
      `SELECT p.code FROM auth.role r
         JOIN auth.role_permission rp ON rp.role_id = r.id
         JOIN auth.permission p ON p.id = rp.permission_id
        WHERE r.name = $1`,
      [rol],
    );
    return rows.map((fila) => fila.code).sort();
  }

  it.each(['doctor', 'admin'] as const)(
    'siembra para el rol %s exactamente los permisos de data-model §8 [US-045 AC-6]',
    async (rol) => {
      expect(await permisosSembradosDe(rol)).toEqual(permisosDocumentadosDe(rol));
    },
  );

  it('veda al admin los permisos clínicos y de análisis de la lista E-04 [US-045 AC-6]', async () => {
    const delAdmin = await permisosSembradosDe('admin');

    for (const vedado of [
      'clinical:read',
      'documents:read',
      'ai_analysis:create',
      'ai_analysis:read',
      'follow_ups:create',
      'follow_ups:read',
    ]) {
      expect(delAdmin).not.toContain(vedado);
    }
  });
});
