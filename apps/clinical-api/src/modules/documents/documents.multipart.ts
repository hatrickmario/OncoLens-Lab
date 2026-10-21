import type { Request } from 'express';
import busboy from 'busboy';

export interface ArchivoRecibido {
  /** Nombre que declaró el cliente. Es identidad (RN-10): solo va a la fila `document`. */
  nombre: string;
  contenido: Buffer;
}

export interface CargaRecibida {
  documentType: string | undefined;
  archivo: ArchivoRecibido | undefined;
}

/** El cuerpo no es un `multipart/form-data` legible. */
export class MultipartIlegible extends Error {
  constructor() {
    super('Cuerpo multipart ilegible');
    this.name = 'MultipartIlegible';
  }
}

/**
 * Lee el `multipart/form-data` de la carga en memoria: un archivo (`file`) y el campo `documentType`. Ignora cualquier
 * otro campo o archivo. El archivo se corta en `limiteDelArchivoEnBytes`: nunca se guarda más que eso en memoria; el
 * resto del cuerpo se descarta al leerlo.
 */
export function leerCargaMultipart(
  request: Request,
  limiteDelArchivoEnBytes: number,
): Promise<CargaRecibida> {
  return new Promise((resolve, reject) => {
    let lector: busboy.Busboy;
    try {
      lector = busboy({
        headers: request.headers,
        defParamCharset: 'utf8',
        limits: { files: 1, fileSize: limiteDelArchivoEnBytes },
      });
    } catch {
      reject(new MultipartIlegible());
      return;
    }
    const carga: { documentType?: string; archivo?: ArchivoRecibido } = {};
    let terminado = false;
    // Un error del lector, del archivo o de la petición (abortada) rechaza una sola vez: sin 'error' sin atender, que
    // tumbaría el proceso, y sin promesa colgada.
    const fallar = (): void => {
      if (terminado) return;
      terminado = true;
      request.unpipe(lector);
      lector.destroy();
      reject(new MultipartIlegible());
    };
    lector.on('field', (nombre, valor) => {
      if (nombre === 'documentType') carga.documentType = valor;
    });
    lector.on('file', (nombre, flujo, info) => {
      flujo.on('error', fallar);
      if (nombre !== 'file') {
        flujo.resume();
        return;
      }
      const trozos: Buffer[] = [];
      flujo.on('data', (trozo: Buffer) => trozos.push(trozo));
      flujo.on('end', () => {
        if (info.filename !== undefined) {
          carga.archivo = { nombre: info.filename, contenido: Buffer.concat(trozos) };
        }
      });
    });
    lector.on('error', fallar);
    lector.on('close', () => {
      if (terminado) return;
      terminado = true;
      resolve({ documentType: carga.documentType, archivo: carga.archivo });
    });
    request.once('error', fallar);
    request.once('close', () => {
      if (!request.complete) fallar();
    });
    request.pipe(lector);
  });
}
