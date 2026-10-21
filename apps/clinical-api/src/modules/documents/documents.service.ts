import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';

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
  reloj: Clock;
  ids: GeneradorDeIds;
}

export function crearDocumentsService(_dependencias: DependenciasDelService): DocumentsService {
  return {
    cargar: () => {
      throw new Error('no implementado');
    },
  };
}
