import { PassThrough } from 'node:stream';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import {
  leerCargaMultipart,
  MultipartIlegible,
} from '../../src/modules/documents/documents.multipart.js';

const LIMITE = 1024;

/** Una petición en memoria (un flujo con cabeceras): la frontera de E/S del lector, sin red. */
function peticionMultipart(): PassThrough & Request {
  return Object.assign(new PassThrough(), {
    headers: { 'content-type': 'multipart/form-data; boundary=XB' },
  }) as unknown as PassThrough & Request;
}

const CABECERA_DEL_ARCHIVO =
  '--XB\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n%PDF-xyz';

describe('leerCargaMultipart', () => {
  it('rechaza con MultipartIlegible, sin colgarse, cuando la petición se aborta a mitad del archivo', async () => {
    const peticion = peticionMultipart();
    const lectura = leerCargaMultipart(peticion, LIMITE);

    peticion.write(CABECERA_DEL_ARCHIVO);
    peticion.destroy(new Error('conexión abortada'));

    await expect(lectura).rejects.toBeInstanceOf(MultipartIlegible);
  }, 2000);

  it('rechaza con MultipartIlegible cuando el cuerpo termina sin el boundary final', async () => {
    const peticion = peticionMultipart();
    const lectura = leerCargaMultipart(peticion, LIMITE);

    peticion.end(CABECERA_DEL_ARCHIVO);

    await expect(lectura).rejects.toBeInstanceOf(MultipartIlegible);
  }, 2000);

  it('resuelve con excedeElLimite y no lanza ninguna excepción no capturada cuando el archivo supera el límite con más datos en vuelo', async () => {
    const peticion = peticionMultipart();
    const erroresDeLaPeticion: Error[] = [];
    peticion.on('error', (error) => erroresDeLaPeticion.push(error));
    const lectura = leerCargaMultipart(peticion, LIMITE);

    peticion.write(CABECERA_DEL_ARCHIVO);
    peticion.write(Buffer.alloc(LIMITE - 20, 0x20));
    // Una ráfaga que cruza el límite a mitad de trozo y trozos que siguen llegando tras el corte.
    peticion.write(Buffer.alloc(5000, 0x20));
    for (let i = 0; i < 20; i += 1) peticion.write(Buffer.alloc(5000, 0x20));
    peticion.end('\r\n--XB--\r\n');

    await expect(lectura).resolves.toMatchObject({ excedeElLimite: true });
    // Deja correr la cola de eventos: una excepción diferida de busboy haría fallar el test como no capturada.
    await new Promise((resolver) => setTimeout(resolver, 50));
    // Destruir busboy dentro de su evento 'limit' hace que lance un TypeError (su `_fileStream` ya es null): según el
    // transporte sale como 'error' de la petición o como excepción no capturada que tumba el proceso.
    expect(erroresDeLaPeticion.map(String)).toEqual([]);
  }, 2000);

  it('no hace lanzar a busboy dentro de su evento limit cuando el trozo que cruza el límite se escribe de forma síncrona', async () => {
    const peticion = peticionMultipart();
    const cuerpo = Buffer.concat([
      Buffer.from(CABECERA_DEL_ARCHIVO),
      Buffer.alloc(LIMITE * 3, 0x20),
      Buffer.from('\r\n--XB--\r\n'),
    ]);
    let lanzado: unknown;
    // Transporte síncrono: la escritura en busboy ocurre dentro de la llamada y un TypeError de busboy sale por aquí
    // (en producción sale como excepción no capturada y tumba el proceso).
    peticion.pipe = ((destino: NodeJS.WritableStream) => {
      try {
        destino.write(cuerpo);
      } catch (error) {
        lanzado = error;
      }
      return destino;
    }) as typeof peticion.pipe;

    const lectura = leerCargaMultipart(peticion, LIMITE);

    await expect(lectura).resolves.toMatchObject({ excedeElLimite: true });
    expect(String(lanzado)).toBe('undefined');
  }, 2000);
});
