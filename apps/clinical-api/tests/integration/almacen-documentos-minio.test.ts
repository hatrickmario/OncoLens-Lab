import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { crearAlmacenMinio } from '../../src/infrastructure/almacen-documentos.minio.js';
import { AlmacenNoDisponible } from '../../src/modules/documents/ports.js';
import { servidorMswConLoopback } from '../support/servidor-msw.js';

const ENDPOINT = 'http://clinical-minio:9000';
const BUCKET = 'clinical-documents';
const CLAVE = '00000000-0000-4000-8000-0000000000a1/3f1b8c52-7a4e-4d0b-9c1e-2a6f5d8e7b10';

interface Peticion {
  metodo: string;
  ruta: string;
  cabeceras: Record<string, string>;
  cuerpo: Buffer;
}
const peticiones: Peticion[] = [];
const registrar = async (request: Request): Promise<void> => {
  peticiones.push({
    metodo: request.method,
    ruta: new URL(request.url).pathname,
    cabeceras: Object.fromEntries(request.headers.entries()),
    cuerpo: Buffer.from(await request.arrayBuffer()),
  });
};

const servidor = servidorMswConLoopback();
beforeAll(() => servidor.iniciar());
afterEach(() => {
  servidor.servidor.resetHandlers();
  peticiones.length = 0;
});
afterAll(() => servidor.detener());

const almacen = () =>
  crearAlmacenMinio({
    endpoint: ENDPOINT,
    bucket: BUCKET,
    accessKey: 'acceso-sintetico',
    secretKey: 'clave-sintetica',
    timeoutMs: 2000,
  });

describe('adapter de clinical-minio', () => {
  it('escribe el objeto en el bucket bajo la clave, como application/pdf y sin metadatos ni Content-Disposition cuando se guarda un documento', async () => {
    servidor.servidor.use(
      http.put(`${ENDPOINT}/${BUCKET}/*`, async ({ request }) => {
        await registrar(request);
        return new HttpResponse(null, { status: 200, headers: { ETag: '"x"' } });
      }),
    );
    const contenido = Buffer.from('%PDF-1.4 sintetico');

    await almacen().guardar(CLAVE, contenido);

    expect(peticiones).toHaveLength(1);
    const [peticion] = peticiones;
    expect(peticion!.ruta).toBe(`/${BUCKET}/${CLAVE}`);
    expect(peticion!.cuerpo.equals(contenido)).toBe(true);
    expect(peticion!.cabeceras['content-type']).toBe('application/pdf');
    expect(Object.keys(peticion!.cabeceras).filter((n) => n.startsWith('x-amz-meta-'))).toEqual([]);
    expect(peticion!.cabeceras['content-disposition']).toBeUndefined();
  });

  it('lanza AlmacenNoDisponible con mensaje fijo, sin host ni bucket ni clave, cuando la red falla al guardar', async () => {
    servidor.servidor.use(http.put(`${ENDPOINT}/${BUCKET}/*`, () => HttpResponse.error()));

    const intento = almacen().guardar(CLAVE, Buffer.from('%PDF-'));

    await expect(intento).rejects.toBeInstanceOf(AlmacenNoDisponible);
    await expect(intento).rejects.toThrow(
      expect.objectContaining({ message: 'Almacén de documentos no disponible' }),
    );
  });

  it('lanza AlmacenNoDisponible cuando el almacén rechaza la escritura con un 403', async () => {
    servidor.servidor.use(
      http.put(`${ENDPOINT}/${BUCKET}/*`, () => new HttpResponse('<Error/>', { status: 403 })),
    );

    await expect(almacen().guardar(CLAVE, Buffer.from('%PDF-'))).rejects.toBeInstanceOf(
      AlmacenNoDisponible,
    );
  });

  it('borra el objeto por su clave y lanza AlmacenNoDisponible cuando la red falla al borrar', async () => {
    servidor.servidor.use(
      http.delete(`${ENDPOINT}/${BUCKET}/*`, async ({ request }) => {
        await registrar(request);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await almacen().borrar(CLAVE);
    expect(peticiones.map((p) => `${p.metodo} ${p.ruta}`)).toEqual([`DELETE /${BUCKET}/${CLAVE}`]);

    servidor.servidor.use(http.delete(`${ENDPOINT}/${BUCKET}/*`, () => HttpResponse.error()));
    await expect(almacen().borrar(CLAVE)).rejects.toBeInstanceOf(AlmacenNoDisponible);
  });

  it('no crea el bucket cuando ya existe', async () => {
    servidor.servidor.use(
      http.head(`${ENDPOINT}/${BUCKET}`, async ({ request }) => {
        await registrar(request);
        return new HttpResponse(null, { status: 200 });
      }),
      http.put(`${ENDPOINT}/${BUCKET}`, async ({ request }) => {
        await registrar(request);
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await almacen().asegurarBucket();

    expect(peticiones.map((p) => p.metodo)).toEqual(['HEAD']);
  });

  it('crea el bucket cuando no existe', async () => {
    servidor.servidor.use(
      http.head(`${ENDPOINT}/${BUCKET}`, () => new HttpResponse(null, { status: 404 })),
      http.put(`${ENDPOINT}/${BUCKET}`, async ({ request }) => {
        await registrar(request);
        return new HttpResponse(null, { status: 200 });
      }),
    );

    await almacen().asegurarBucket();

    expect(peticiones.map((p) => `${p.metodo} ${p.ruta}`)).toEqual([`PUT /${BUCKET}/`]);
  });

  it('lanza AlmacenNoDisponible cuando el almacén no responde al asegurar el bucket', async () => {
    servidor.servidor.use(http.head(`${ENDPOINT}/${BUCKET}`, () => HttpResponse.error()));

    await expect(almacen().asegurarBucket()).rejects.toBeInstanceOf(AlmacenNoDisponible);
  });
});
