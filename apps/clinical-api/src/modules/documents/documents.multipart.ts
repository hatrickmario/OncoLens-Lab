import type { Request } from 'express';
import busboy from 'busboy';
import { normalizarNombreOriginal } from './documents.reglas.js';

export interface ArchivoRecibido {
  /** Nombre que declaró el cliente, ya normalizado. Es identidad (RN-10): solo va a la fila `document`. */
  nombreOriginal: string;
  contenido: Buffer;
}

export interface CargaRecibida {
  documentType: string | undefined;
  archivo: ArchivoRecibido | undefined;
  /** El archivo superó el límite de lectura: se dejó de leer el cuerpo y `archivo` no está completo. */
  excedeElLimite: boolean;
}

/** Un formulario legítimo trae `documentType` y `file`: lo demás es ruido o ataque y se rechaza. */
const LIMITES_DEL_MULTIPART = { campos: 4, partes: 6, bytesPorCampo: 1024, paresDeCabecera: 20 };

/** El cuerpo no es un `multipart/form-data` legible. */
export class MultipartIlegible extends Error {
  constructor() {
    super('Cuerpo multipart ilegible');
    this.name = 'MultipartIlegible';
  }
}

interface CargaParcial {
  documentType?: string;
  archivo?: ArchivoRecibido;
}

/** Control de la lectura: cada promesa se decide una sola vez, y se deja de alimentar a busboy al cortar. */
interface ControlDeLectura {
  /** Rechaza con `MultipartIlegible` y corta la lectura; sin 'error' sin atender, que tumbaría el proceso. */
  fallar(): void;
  /** Resuelve con `carga`; con `cortar` también deja de leer el cuerpo. */
  terminar(carga: CargaRecibida, cortar: boolean): void;
}

function crearLector(request: Request, limiteDelArchivoEnBytes: number): busboy.Busboy {
  return busboy({
    headers: request.headers,
    defParamCharset: 'utf8',
    limits: {
      files: 1,
      fields: LIMITES_DEL_MULTIPART.campos,
      parts: LIMITES_DEL_MULTIPART.partes,
      fieldSize: LIMITES_DEL_MULTIPART.bytesPorCampo,
      headerPairs: LIMITES_DEL_MULTIPART.paresDeCabecera,
      fileSize: limiteDelArchivoEnBytes,
    },
  });
}

function crearControlDeLectura(
  request: Request,
  lector: busboy.Busboy,
  resolve: (carga: CargaRecibida) => void,
  reject: (error: Error) => void,
): ControlDeLectura {
  let terminado = false;
  /**
   * Deja de alimentar a busboy y descarta el resto del cuerpo. NUNCA destruye a busboy dentro de uno de sus eventos:
   * su código sigue usando `_fileStream` al volver del evento y destruirlo en ese momento lanza un TypeError que, según
   * el transporte, sale como excepción no capturada y tumba el proceso. Se destruye en la siguiente vuelta.
   */
  const cortarLectura = (): void => {
    request.unpipe(lector);
    request.resume();
    setImmediate(() => lector.destroy());
  };
  return {
    fallar() {
      if (terminado) return;
      terminado = true;
      cortarLectura();
      reject(new MultipartIlegible());
    },
    terminar(carga, cortar) {
      if (terminado) return;
      terminado = true;
      if (cortar) cortarLectura();
      resolve(carga);
    },
  };
}

function atenderCampos(
  lector: busboy.Busboy,
  carga: CargaParcial,
  control: ControlDeLectura,
): void {
  lector.on('field', (nombre, valor, info) => {
    if (info.valueTruncated || info.nameTruncated) {
      control.fallar();
      return;
    }
    if (nombre === 'documentType') carga.documentType = valor;
  });
  for (const evento of ['partsLimit', 'filesLimit', 'fieldsLimit'] as const) {
    lector.on(evento, control.fallar);
  }
}

function atenderArchivo(
  lector: busboy.Busboy,
  carga: CargaParcial,
  control: ControlDeLectura,
): void {
  lector.on('file', (nombre, flujo, info) => {
    flujo.on('error', control.fallar);
    if (nombre !== 'file') {
      flujo.resume();
      return;
    }
    const trozos: Buffer[] = [];
    flujo.on('data', (trozo: Buffer) => trozos.push(trozo));
    // Se deja de leer el cuerpo: el resto del archivo no se descarga ni se guarda.
    flujo.on('limit', () =>
      control.terminar(
        { documentType: carga.documentType, archivo: undefined, excedeElLimite: true },
        true,
      ),
    );
    flujo.on('end', () => {
      if (info.filename !== undefined) {
        carga.archivo = {
          nombreOriginal: normalizarNombreOriginal(info.filename),
          contenido: Buffer.concat(trozos),
        };
      }
    });
  });
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
      lector = crearLector(request, limiteDelArchivoEnBytes);
    } catch {
      reject(new MultipartIlegible());
      return;
    }
    const carga: CargaParcial = {};
    const control = crearControlDeLectura(request, lector, resolve, reject);
    atenderCampos(lector, carga, control);
    atenderArchivo(lector, carga, control);
    lector.on('error', control.fallar);
    lector.on('close', () =>
      control.terminar(
        { documentType: carga.documentType, archivo: carga.archivo, excedeElLimite: false },
        false,
      ),
    );
    request.once('error', control.fallar);
    request.once('close', () => {
      if (!request.complete) control.fallar();
    });
    request.pipe(lector);
  });
}
