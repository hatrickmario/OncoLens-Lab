import { createHash } from 'node:crypto';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { DocumentsRepository } from './documents.repository.js';
import { ArchivoNoPdf } from './documents.errores.js';
import { claveDeObjeto, esPdfPorMagicBytes } from './documents.reglas.js';
import type { AlmacenDeDocumentos } from './ports.js';

export type TipoDeDocumento = 'historia_clinica' | 'examen';

export interface SolicitudDeCarga {
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
}

const TIPO_MIME_DEL_PDF = 'application/pdf';

const sha256 = (contenido: Buffer): string => createHash('sha256').update(contenido).digest('hex');

/** Carga de un documento: guarda el binario y deja la fila encolada (`pendiente`) para la extracción (US-078). */
export function crearDocumentsService(dependencias: DependenciasDelService): DocumentsService {
  const { repo, almacen, reloj, ids } = dependencias;
  return {
    async cargar(solicitud) {
      if (!esPdfPorMagicBytes(solicitud.contenido)) throw new ArchivoNoPdf();
      const id = ids();
      const clave = claveDeObjeto(solicitud.patientId, id);
      const subidoEn = reloj.now();
      await almacen.guardar(clave, solicitud.contenido);
      await repo.insertar({
        id,
        patientId: solicitud.patientId,
        documentType: solicitud.documentType,
        objectStorageKey: clave,
        checksum: sha256(solicitud.contenido),
        originalFilename: solicitud.nombreOriginal,
        mimeType: TIPO_MIME_DEL_PDF,
        uploadedBy: solicitud.userId,
        uploadedAt: subidoEn,
      });
      return {
        id,
        patientId: solicitud.patientId,
        documentType: solicitud.documentType,
        originalFilename: solicitud.nombreOriginal,
        ocrStatus: 'pendiente',
        uploadedAt: subidoEn.toISOString(),
      };
    },
  };
}
