import { zListPatientsQuery } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import type { Mensajes } from '../mensajes';

/** Textos del espacio de nombres `pacientes` de messages/es.json. */
export type TextosDePacientes = Mensajes['pacientes'];

/** Filtros del listado: los únicos parámetros que viajan en la URL de `/pacientes` (sin identidad, RN-10). */
export interface FiltrosDelListado {
  status?: 'activo' | 'egresado';
  dataOrigin?: 'sintetico' | 'real_anonimizado' | 'real_identificado';
  page?: number;
}

type ParametrosDeLaUrl = Record<string, string | string[] | undefined>;

function primerValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Lee de la URL solo `status`, `dataOrigin` y `page`, validados con el Zod generado del contrato. Cualquier otro
 * parámetro (p. ej., una identidad pegada a mano) se ignora; un valor inválido cae al listado sin filtros.
 */
export function leerFiltros(parametros: ParametrosDeLaUrl): FiltrosDelListado {
  const pagina = primerValor(parametros['page']);
  const leidos = zListPatientsQuery.safeParse({
    status: primerValor(parametros['status']),
    dataOrigin: primerValor(parametros['dataOrigin']),
    ...(pagina !== undefined && { page: Number(pagina) }),
  });
  if (!leidos.success) {
    return {};
  }
  const { status, dataOrigin, page } = leidos.data;
  return {
    ...(status !== undefined && { status }),
    ...(dataOrigin !== undefined && { dataOrigin }),
    ...(page > 1 && { page }),
  };
}

/** Consulta (`status=…&dataOrigin=…&page=…`) con solo los filtros presentes; la página 1 no se escribe. */
export function consultaDeFiltros(filtros: FiltrosDelListado): string {
  const parametros = new URLSearchParams();
  if (filtros.status !== undefined) parametros.set('status', filtros.status);
  if (filtros.dataOrigin !== undefined) parametros.set('dataOrigin', filtros.dataOrigin);
  if (filtros.page !== undefined && filtros.page > 1) parametros.set('page', String(filtros.page));
  return parametros.toString();
}

/** Enlace del listado con esos filtros: la única parte de `/pacientes` que lleva query. */
export function hrefDelListado(filtros: FiltrosDelListado): string {
  const consulta = consultaDeFiltros(filtros);
  return consulta === '' ? '/pacientes' : `/pacientes?${consulta}`;
}
