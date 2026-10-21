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
});
