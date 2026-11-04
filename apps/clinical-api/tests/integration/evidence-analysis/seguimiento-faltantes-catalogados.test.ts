import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9700;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-seguimiento-faltantes-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_faltantes', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

/** Claves del catálogo de datos críticos del tipo de cáncer (`packages/clinical-catalogs/<tipo>/datos-criticos.json`). */
function clavesDelCatalogo(tipo: 'mama' | 'prostata'): Set<string> {
  const { items } = JSON.parse(
    readFileSync(`${RUTA_DEL_CATALOGO}/${tipo}/datos-criticos.json`, 'utf8'),
  ) as { items: { key: string }[] };
  return new Set(items.map((item) => item.key));
}

async function faltantesEnviadosAlSeguimiento(letra: 'a' | 'b'): Promise<unknown[]> {
  const { app } = await montarGateway(mundo, { analysisMaxOptions: 3 });
  const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente(letra));
  rag.reiniciar();
  const respuesta = await clienteVerificado(app)
    .post(rutaDeSeguimiento(analisis.id))
    .set('Cookie', cookie)
    .send({ question: PREGUNTA_DE_SEGUIMIENTO });
  expect(respuesta.status).toBe(201);
  expect(rag.seguimiento.capturadas).toHaveLength(1);
  const contexto = rag.seguimiento.capturadas[0]!.cuerpo['clinicalContext'] as {
    missingCriticalData: unknown[];
  };
  return contexto.missingCriticalData;
}

describe('faltantes del contexto de seguimiento (invariante de L1D-113)', () => {
  it.each([
    ['mama', 'a'],
    ['prostata', 'b'],
  ] as const)(
    'envía solo claves del catálogo de %s en missingCriticalData cuando el oncólogo pregunta sobre el análisis [US-218 AC-1] [US-116 AC-3]',
    async (tipo, letra) => {
      const enviados = await faltantesEnviadosAlSeguimiento(letra);
      const catalogo = clavesDelCatalogo(tipo);

      expect(enviados.length).toBeGreaterThan(0);
      for (const clave of enviados) {
        expect(typeof clave).toBe('string');
        expect(catalogo.has(clave as string)).toBe(true);
        expect(clave).toMatch(/^[a-z0-9_]+$/);
      }
    },
  );
});
