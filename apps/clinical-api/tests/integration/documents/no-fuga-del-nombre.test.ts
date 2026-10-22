import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { capturarSalidas } from '../../support/captura-de-salidas.js';
import {
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  instalarFalloDeInsercionDeDocumento,
  montarDocumentos,
  quitarFalloDeInsercionDeDocumento,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { crearPacienteSintetico } from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 566;
// PII SINTÉTICA sembrada en el nombre del archivo (RN-13, RN-14): se arma por partes para que el escáner de PII de la
// CI no la confunda con un dato real.
const NOMBRE_SINTETICO = ['Lucia', 'Fernanda', 'Pena'].join('-');
const DOCUMENTO_SINTETICO = ['1234', '567'].join('');
const NOMBRE_ORIGINAL = `${NOMBRE_SINTETICO}-${DOCUMENTO_SINTETICO}.pdf`;
const FRAGMENTOS_PROHIBIDOS = [
  NOMBRE_SINTETICO,
  ...NOMBRE_SINTETICO.split('-'),
  DOCUMENTO_SINTETICO,
  'SINT examen sintetico',
];

let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_no_fuga', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

interface Camino {
  readonly nombre: string;
  readonly status: number;
  readonly preparar?: (paciente: string) => Promise<() => Promise<void>>;
  readonly contenido?: Buffer;
}

const CAMINOS: readonly Camino[] = [
  { nombre: 'carga correcta', status: 202 },
  { nombre: 'duplicado', status: 409 },
  { nombre: 'archivo que no es PDF', status: 422, contenido: fixture('informe.docx') },
  {
    nombre: 'almacén caído',
    status: 503,
    preparar: async () => {
      escenario.entorno.caerAlmacen();
      return async () => undefined;
    },
  },
  {
    nombre: 'fallo del INSERT',
    status: 500,
    preparar: async () => {
      await instalarFalloDeInsercionDeDocumento(escenario.mundo.cliente);
      return () => quitarFalloDeInsercionDeDocumento(escenario.mundo.cliente);
    },
  },
];

describe('no-fuga del nombre del archivo [RN-10]', () => {
  it.each(CAMINOS)(
    'no deja el nombre, la PII del nombre, la clave ni el contenido en logs, salidas ni errores cuando el camino es $nombre ($status)',
    async (camino) => {
      const { app, logger } = montarDocumentos(escenario.mundo);
      const paciente = await crearPacienteSintetico(escenario.mundo, { conDiagnostico: false });
      const contenido = camino.contenido ?? fixture('mama-examen.pdf');
      const enviar = () =>
        clienteVerificado(app, {
          respuestasAjenasAlContrato: [
            {
              ruta: `/platform/patients/${paciente}/documents`,
              status: 500,
              esquema: '#/components/schemas/ErrorInterno',
            },
          ],
        })
          .post(`/platform/patients/${paciente}/documents`)
          .set('Cookie', escenario.cookieDoctor)
          .field('documentType', 'examen')
          .attach('file', contenido, NOMBRE_ORIGINAL);
      if (camino.nombre === 'duplicado') await enviar();
      const deshacer = (await camino.preparar?.(paciente)) ?? (async () => undefined);

      let respuesta: Awaited<ReturnType<typeof enviar>> | undefined;
      const salidas = await capturarSalidas(async () => {
        try {
          respuesta = await enviar();
        } finally {
          await deshacer();
        }
      });

      expect(respuesta?.status).toBe(camino.status);
      const registrado = `${logger.texto()}\n${salidas}`;
      const clavesDeObjetos = [...escenario.entorno.objetos().keys()];
      for (const prohibido of [...FRAGMENTOS_PROHIBIDOS, ...clavesDeObjetos]) {
        expect(registrado).not.toContain(prohibido);
      }
      if (camino.status !== 202) {
        // Los errores no hacen eco del archivo.
        for (const prohibido of FRAGMENTOS_PROHIBIDOS) {
          expect(JSON.stringify(respuesta?.body)).not.toContain(prohibido);
        }
      }
    },
  );

  it('guarda el nombre solo en la fila del documento y no lo deja en el objeto, en audit ni en rag-orchestrator cuando se carga un PDF', async () => {
    const { app } = montarDocumentos(escenario.mundo);
    const paciente = await crearPacienteSintetico(escenario.mundo, { conDiagnostico: false });

    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${paciente}/documents`)
      .set('Cookie', escenario.cookieDoctor)
      .field('documentType', 'examen')
      .attach('file', fixture('mama-examen.pdf'), NOMBRE_ORIGINAL);

    expect(respuesta.status).toBe(202);
    const [fila] = await documentosDelPaciente(escenario.mundo, paciente);
    const clave = fila!.object_storage_key;
    expect(clave).not.toContain(NOMBRE_SINTETICO);
    const objeto = escenario.entorno.objetos().get(clave);
    expect(objeto).toBeDefined();
    const cabeceras = objeto!.cabeceras;
    expect(Object.keys(cabeceras).filter((nombre) => nombre.startsWith('x-amz-meta-'))).toEqual([]);
    expect(cabeceras['content-disposition']).toBeUndefined();
    for (const prohibido of FRAGMENTOS_PROHIBIDOS) {
      expect(Object.values(cabeceras).join('\n')).not.toContain(prohibido);
    }
    const { rows } = await escenario.mundo.cliente.query<{ coincidencias: string }>(
      `SELECT count(*) AS coincidencias FROM audit.audit_log WHERE audit_log::text ILIKE $1`,
      [`%${NOMBRE_SINTETICO}%`],
    );
    expect(Number(rows[0]?.coincidencias)).toBe(0);
    expect(escenario.entorno.llamadasARag()).toBe(0);
    expect(fila!.original_filename).toBe(NOMBRE_ORIGINAL);
  });
});
