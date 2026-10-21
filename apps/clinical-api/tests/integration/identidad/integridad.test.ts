import { createHash } from 'node:crypto';
import { Router } from 'express';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appConAuth } from '../../support/app-auth.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  FX_T4A_A,
  crearBaseDeIdentidad,
  identidadDeFx,
  insertarPacienteSintetico,
  servicioDeIdentidad,
} from '../../support/identidad.js';
import {
  crearUsuariosDeAuth,
  insertarSesion,
  loggerEnMemoria,
  relojFijo,
  tokensFijos,
} from '../../support/usuarios.js';

const ESPACIO_DE_IDS = 12;
/** Ruta de mentira para ejercitar el guard: el contrato no la describe, así que no se verifica contra el spec. */
const RUTA_DE_MENTIRA = {
  respuestasAjenasAlContrato: [
    { ruta: '/platform/identidad-de-prueba', esquema: '#/components/schemas/ErrorInterno' },
  ],
};
const TOKEN_DE_SESION = 'SINT-cookie-sesion-identidad-0001';
const hashDe = (token: string) => createHash('sha256').update(token).digest('hex');

describe('Error de integridad de la identidad cifrada', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let patientId: string;
  let cookie: string;

  beforeAll(async () => {
    base = await crearBaseDeIdentidad('integridad');
    cliente = await conectar(base.url);
    patientId = await insertarPacienteSintetico(cliente, generadorDeIds(ESPACIO_DE_IDS));
    await servicioDeIdentidad(cliente).guardar(identidadDeFx(patientId));
    const { ids, doc1 } = await crearUsuariosDeAuth(cliente, ESPACIO_DE_IDS);
    await insertarSesion(cliente, ids, {
      userId: doc1.id,
      tokenHash: hashDe(TOKEN_DE_SESION),
      expiresAt: '2026-10-16T20:00:00.000Z',
    });
    cookie = `oncolens_session=${TOKEN_DE_SESION}`;
  });

  afterAll(async () => {
    await cliente.end();
    await base.destruir();
  });

  it('responde 500 ErrorInterno sin datos del paciente y el log solo registra IDENTITY_INTEGRITY_ERROR cuando un byte del cifrado fue alterado [US-046 AC-3]', async () => {
    // Un bit alterado en el texto cifrado (con SQL crudo): la etiqueta GCM ya no verifica.
    await cliente.query(
      `UPDATE identity.patient_identity
          SET national_id_ciphertext = set_byte(national_id_ciphertext, 14, get_byte(national_id_ciphertext, 14) # 1)
        WHERE patient_id = $1`,
      [patientId],
    );
    const { rows } = await cliente.query<{ cifrado: string }>(
      'SELECT encode(national_id_ciphertext, $2) AS cifrado FROM identity.patient_identity WHERE patient_id = $1',
      [patientId, 'hex'],
    );
    const servicio = servicioDeIdentidad(cliente);
    const rutaDeDescifrado = Router();
    // Ruta del propio test (sin vi.mock): descifra la identidad como lo hará la ficha (L1D-72).
    // Ruta fija: el id sale del cierre del test, no de la petición.
    rutaDeDescifrado.get('/identidad-de-prueba', async (_peticion, respuesta) => {
      const identidad = await servicio.descifrar(patientId);
      respuesta.status(200).json(identidad);
    });
    const logger = loggerEnMemoria();
    const app = appConAuth({
      cliente,
      espacio: ESPACIO_DE_IDS,
      tokens: tokensFijos('no-se-usa'),
      reloj: relojFijo(),
      registrar: logger.registrar,
      rutasProtegidas: [rutaDeDescifrado],
    });

    const respuesta = await clienteVerificado(app, RUTA_DE_MENTIRA)
      .get('/platform/identidad-de-prueba')
      .set('Cookie', cookie);

    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toEqual({
      error: 'ERROR_INTERNO',
      message: 'Error interno del servidor.',
      traceId: 'req_00000001',
    });
    for (const prohibido of [FX_T4A_A.numeroDeDocumento, FX_T4A_A.nombre, FX_T4A_A.apellido]) {
      expect(respuesta.text, prohibido).not.toContain(prohibido);
    }
    expect(logger.lineas).toEqual([
      { event: 'error.no_controlado', code: 'IDENTITY_INTEGRITY_ERROR', traceId: 'req_00000001' },
    ]);
    expect(logger.texto()).not.toContain(rows[0]?.cifrado);
  });
});
