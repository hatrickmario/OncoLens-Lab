import 'server-only';
import type { DependenciasDelBff } from './dependencias';

export type OperacionDeRegistroManual =
  | 'correctBiomarker'
  | 'getBiomarkerHistory'
  | 'listClinicalNotes'
  | 'correctClinicalNote'
  | 'getClinicalNoteHistory';

export interface ParametrosDeRuta {
  id: string;
  biomarkerId?: string;
  noteId?: string;
}

export type ManejadorDeRegistroManual = (
  request: Request,
  parametros: ParametrosDeRuta,
) => Promise<Response>;

export function crearManejadorDeRegistroManual(
  _dependencias: DependenciasDelBff,
  _operacion: OperacionDeRegistroManual,
): ManejadorDeRegistroManual {
  throw new Error('no implementado');
}
