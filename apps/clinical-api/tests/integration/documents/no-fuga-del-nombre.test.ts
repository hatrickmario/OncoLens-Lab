import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { idDePaciente } from '../../support/gateway.js';
import { capturarSalidas } from '../../support/captura-de-salidas.js';
import {
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 566;
const PACIENTE = idDePaciente('a');
const NOMBRE_ORIGINAL = 'mama-examen.pdf';
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_no_fuga', ESPACIO_DE_IDS);
});
beforeEach(() => escenario.entorno.reiniciar());
afterAll(() => escenario.cerrar());

describe('no-fuga del documento cargado [RN-10]', () => {
  it('no deja el nombre del archivo, la clave del objeto ni el contenido en los logs, en el almacén, en audit ni en rag-orchestrator cuando se carga un PDF', async () => {
    const { app, logger } = montarDocumentos(escenario.mundo);
    const pdf = fixture('mama-examen.pdf');

    const salidas = await capturarSalidas(async () => {
      const respuesta = await clienteVerificado(app)
        .post(`/platform/patients/${PACIENTE}/documents`)
        .set('Cookie', escenario.cookieDoctor)
        .field('documentType', 'examen')
        .attach('file', pdf, NOMBRE_ORIGINAL);
      expect(respuesta.status).toBe(202);
    });

    const [fila] = await documentosDelPaciente(escenario.mundo, PACIENTE);
    const clave = fila!.object_storage_key;
    const registrado = `${logger.texto()}\n${salidas}`;
    // Los logs llevan UUID y resultado: ni nombre, ni clave del objeto, ni un fragmento del contenido.
    expect(registrado).toContain(fila!.id);
    for (const prohibido of ['mama-examen', clave, 'SINT examen sintetico']) {
      expect(registrado).not.toContain(prohibido);
    }
    // El objeto en clinical-minio: sin metadatos ni Content-Disposition con el nombre.
    const objeto = escenario.entorno.objetos().get(clave);
    expect(objeto).toBeDefined();
    const cabeceras = objeto!.cabeceras;
    expect(Object.keys(cabeceras).filter((nombre) => nombre.startsWith('x-amz-meta-'))).toEqual([]);
    expect(cabeceras['content-disposition']).toBeUndefined();
    expect(Object.values(cabeceras).join('\n')).not.toContain('mama-examen');
    // audit y rag-orchestrator: nada.
    const { rows } = await escenario.mundo.cliente.query<{ coincidencias: string }>(
      `SELECT count(*) AS coincidencias FROM audit.audit_log WHERE audit_log::text ILIKE '%mama-examen%'`,
    );
    expect(Number(rows[0]?.coincidencias)).toBe(0);
    expect(escenario.entorno.llamadasARag()).toBe(0);
    // El único lugar donde vive el nombre original es la fila del documento.
    expect(fila!.original_filename).toBe(NOMBRE_ORIGINAL);
  });
});
