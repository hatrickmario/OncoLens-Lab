import { createHash } from 'node:crypto';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { DocumentsRepository, NuevoDocumento } from './documents.repository.js';
import {
  ArchivoDemasiadoGrande,
  ArchivoNoPdf,
  DocumentoDuplicado,
  PacienteNoEncontrado,
} from './documents.errores.js';
import type { TipoDeDocumento } from './documents.schema.js';
import { claveDeObjeto, esPdfPorMagicBytes, superaTamanoMaximo } from './documents.reglas.js';
import type { AlmacenDeDocumentos } from './ports.js';

export interface SolicitudDeCarga {
  /** `traceId` de la petición: solo para el log de la compensación. */
  traceId: string;
  patientId: string;
  userId: string;
  documentType: TipoDeDocumento;
  nombreOriginal: string;
  contenido: Buffer;
}

export interface DocumentoCargado {
  id: string;
  patientId: string;
  documentType: TipoDeDocumento;
  originalFilename: string;
  ocrStatus: 'pendiente';
  uploadedAt: string;
}

export interface DocumentsService {
  cargar(solicitud: SolicitudDeCarga): Promise<DocumentoCargado>;
}

export interface DependenciasDelService {
  repo: DocumentsRepository;
  almacen: AlmacenDeDocumentos;
  reloj: Clock;
  ids: GeneradorDeIds;
  registrar: Registrar;
  /** `MAX_UPLOAD_MB` (RN-22). */
  maxUploadMb: number;
}

const TIPO_MIME_DEL_PDF = 'application/pdf';

const sha256 = (contenido: Buffer): string => createHash('sha256').update(contenido).digest('hex');

/** Carga de un documento: guarda el binario y deja la fila encolada (`pendiente`) para la extracción (US-078). */
export function crearDocumentsService(dependencias: DependenciasDelService): DocumentsService {
  const { repo, almacen, reloj, ids, registrar, maxUploadMb } = dependencias;

  /**
   * Borra el objeto recién escrito cuando la carga no llegó a encolarse. Es de mejor esfuerzo: si el borrado falla no
   * cambia la respuesta (un duplicado sigue siendo 409) y queda un objeto huérfano que solo se registra por UUID (nunca
   * la clave ni el nombre, RN-10) para el job de retención.
   */
  async function compensar(clave: string, solicitud: SolicitudDeCarga, documentId: string) {
    try {
      await almacen.borrar(clave);
    } catch {
      registrar({
        event: 'documents.compensacion',
        resultado: 'fallida',
        documentId,
        patientId: solicitud.patientId,
        traceId: solicitud.traceId,
      });
    }
  }

  /** Inserta la fila; si falla o pierde la carrera por el checksum, compensa el objeto recién escrito. */
  async function insertarOCompensar(
    solicitud: SolicitudDeCarga,
    clave: string,
    documento: NuevoDocumento,
  ): Promise<'creado' | 'duplicado'> {
    try {
      const resultado = await repo.insertar(documento);
      if (resultado === 'duplicado') await compensar(clave, solicitud, documento.id);
      return resultado;
    } catch (error) {
      await compensar(clave, solicitud, documento.id);
      throw error;
    }
  }

  /**
   * Todas las reglas que rechazan una carga, en orden de barato a caro y ANTES de tocar el almacén (nada se escribe
   * si alguna falla). Devuelve el checksum que ya calculó para no repetirlo.
   */
  async function validarAntesDeAlmacenar(solicitud: SolicitudDeCarga): Promise<string> {
    if (!(await repo.existePaciente(solicitud.patientId))) throw new PacienteNoEncontrado();
    if (superaTamanoMaximo(solicitud.contenido.length, maxUploadMb))
      throw new ArchivoDemasiadoGrande();
    if (!esPdfPorMagicBytes(solicitud.contenido)) throw new ArchivoNoPdf();
    const checksum = sha256(solicitud.contenido);
    if (await repo.existeChecksum(solicitud.patientId, checksum)) throw new DocumentoDuplicado();
    return checksum;
  }

  /** Guarda el binario bajo una clave opaca y deja la fila encolada (`pendiente`) para la extracción. */
  async function almacenarYEncolar(
    solicitud: SolicitudDeCarga,
    checksum: string,
  ): Promise<DocumentoCargado> {
    const id = ids();
    const clave = claveDeObjeto(solicitud.patientId, id);
    const subidoEn = reloj.now();
    await almacen.guardar(clave, solicitud.contenido);
    const resultado = await insertarOCompensar(solicitud, clave, {
      id,
      patientId: solicitud.patientId,
      documentType: solicitud.documentType,
      objectStorageKey: clave,
      checksum,
      originalFilename: solicitud.nombreOriginal,
      mimeType: TIPO_MIME_DEL_PDF,
      uploadedBy: solicitud.userId,
      uploadedAt: subidoEn,
    });
    if (resultado === 'duplicado') throw new DocumentoDuplicado();
    return {
      id,
      patientId: solicitud.patientId,
      documentType: solicitud.documentType,
      originalFilename: solicitud.nombreOriginal,
      ocrStatus: 'pendiente',
      uploadedAt: subidoEn.toISOString(),
    };
  }

  return {
    async cargar(solicitud) {
      const checksum = await validarAntesDeAlmacenar(solicitud);
      return almacenarYEncolar(solicitud, checksum);
    },
  };
}
