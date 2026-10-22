import type { Mensajes } from '../mensajes';

/** Textos del espacio de nombres `pacientes` de messages/es.json. */
export type TextosDePacientes = Mensajes['pacientes'];

/** Filtros del listado: los únicos parámetros que viajan en la URL de `/pacientes` (sin identidad, RN-10). */
export interface FiltrosDelListado {
  status?: 'activo' | 'egresado';
  dataOrigin?: 'sintetico' | 'real_anonimizado' | 'real_identificado';
  page?: number;
}
