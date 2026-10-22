import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearLectorDeIdentidad } from '../../../src/modules/evidence-analysis/deidentification/patient-identity.reader.js';
import type { IdentityService } from '../../../src/modules/patients/identity.service.js';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  PII_FX_T4A_A,
  crearPacienteFxT4aA,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { FX_T4A_A, servicioDeIdentidad } from '../../support/identidad.js';
import { montarPacientes } from '../../support/pacientes.js';
import {
  capturarSalidaDelProceso,
  ejecutarArnesDeNoFuga,
  fuentesDeBaseDeDatos,
  type Fuente,
  valoresDeIdentidad,
  type PasoDeNoFuga,
} from '../../support/no-fuga.js';

const ESPACIO_DE_IDS = 13;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-nofuga-0001';

describe('La identidad nunca sale de clinical-api (RN-10)', () => {
  const rag = ragSimulado();
  let mundo: MundoDeGateway;
  let identidad: IdentityService;
  let cookie: string;

  beforeAll(async () => {
    rag.iniciar();
    mundo = await prepararMundoConSeed('identidad_nofuga', ESPACIO_DE_IDS);
    identidad = servicioDeIdentidad(mundo.cliente);
    cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  });
  afterEach(() => rag.reiniciar());
  afterAll(async () => {
    rag.detener();
    await mundo.cerrar();
  });

  /** Índices ciegos de la fila (`national_id_hmac` y, cuando exista la columna, `full_name_hmac`, L1D-202). */
  async function indicesCiegosDe(patientId: string): Promise<string[]> {
    const { rows } = await mundo.cliente.query<Record<string, string | null>>(
      'SELECT * FROM identity.patient_identity WHERE patient_id = $1',
      [patientId],
    );
    const fila = rows[0] ?? {};
    return ['national_id_hmac', 'full_name_hmac'].flatMap((columna) => fila[columna] ?? []);
  }

  it('no deja el documento, el nombre ni los índices ciegos en logs, audit, research, ai_analysis_record ni en el payload hacia rag-orchestrator cuando se registra y se analiza FX-T4a-a [US-046 AC-4]', async () => {
    const { app, logger } = await montarGateway(mundo, {
      // El lector de producción: la identidad se descifra de PostgreSQL con IdentityService (RN-10, RN-11).
      identidades: crearLectorDeIdentidad(identidad),
    });
    let patientId = '';
    // Pasos ampliables: la ficha (L1D-72) y la búsqueda por documento (L1D-202) añaden el suyo aquí.
    const pasos: PasoDeNoFuga[] = [
      {
        nombre: 'registrar',
        ejecutar: async () => {
          patientId = await crearPacienteFxT4aA(mundo, identidad);
        },
      },
      {
        nombre: 'analizar',
        ejecutar: async () => {
          const respuesta = await clienteVerificado(app)
            .post('/platform/evidence-analyses')
            .set('Cookie', cookie)
            .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });
          expect(respuesta.status).toBe(200);
        },
      },
      // L1D-202 (US-048 AC-5): buscarlo por documento y por nombre también cuenta como salida de la identidad.
      {
        nombre: 'buscar por documento',
        ejecutar: async () => {
          const buscador = montarPacientes(mundo, { logger, identidad });
          const respuesta = await clienteVerificado(buscador.app)
            .post('/platform/patients/search')
            .set('Cookie', cookie)
            .send({ idType: FX_T4A_A.idType, nationalId: PII_FX_T4A_A.cedula });
          expect(respuesta.body.items).toHaveLength(1);
        },
      },
      {
        nombre: 'buscar por nombre',
        ejecutar: async () => {
          const buscador = montarPacientes(mundo, { logger, identidad });
          const respuesta = await clienteVerificado(buscador.app)
            .post('/platform/patients/search')
            .set('Cookie', cookie)
            .send({ name: FX_T4A_A.nombreNormalizado });
          expect(respuesta.body.items).toHaveLength(1);
        },
      },
      // L1D-72 (US-051): consultar la ficha descifra la identidad solo para su respuesta; no puede quedar en ninguna otra salida.
      {
        nombre: 'consultar la ficha',
        ejecutar: async () => {
          const lector = montarPacientes(mundo, { logger, identidad });
          const respuesta = await clienteVerificado(lector.app)
            .get(`/platform/patients/${patientId}`)
            .set('Cookie', cookie);
          expect(respuesta.status).toBe(200);
          expect(respuesta.body.identification.nationalId).toBe(PII_FX_T4A_A.cedula);
        },
      },
    ];

    const { salida, restaurar } = capturarSalidaDelProceso();
    let hallazgos: Awaited<ReturnType<typeof ejecutarArnesDeNoFuga>>;
    try {
      hallazgos = await ejecutarArnesDeNoFuga({
        pasos,
        valores: async () => {
          const guardada = await identidad.descifrar(patientId);
          if (guardada === null) throw new Error('la identidad de FX-T4a-a no quedó guardada');
          return [...valoresDeIdentidad(guardada), ...(await indicesCiegosDe(patientId))];
        },
        fuentes: async (): Promise<Fuente[]> => [
          ...logger.lineas.map((linea, indice) => ({
            nombre: `log:clinical-api[${indice}]`,
            texto: JSON.stringify(linea),
          })),
          ...rag.capturadas.map((captura, indice) => ({
            nombre: `payload:rag-orchestrator[${indice}]`,
            texto: captura.texto,
          })),
          ...rag.capturadas.map((captura, indice) => ({
            nombre: `cabeceras:rag-orchestrator[${indice}]`,
            texto: [...captura.headers].join('\n'),
          })),
          ...salida.map((texto, indice) => ({ nombre: `salida:proceso[${indice}]`, texto })),
          ...(await fuentesDeBaseDeDatos(mundo.cliente)),
        ],
      });
    } finally {
      restaurar();
    }
    expect(rag.llamadas()).toBe(1);
    expect(hallazgos).toEqual([]);
  });
});
