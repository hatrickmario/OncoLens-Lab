import type { z } from 'zod';
import {
  zListPatientsQuery,
  zSearchPatientsBody,
} from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Validaciones del borde de `GET /platform/patients` y `POST /platform/patients/search`: se generan del spec. Aquí solo
 * se añade lo que el spec no expresa: el listado rechaza cualquier parámetro que no sea un filtro sin identidad (RN-10)
 * y la búsqueda exige un criterio completo (el `anyOf` del contrato no sobrevive a la generación de Zod).
 */
export const filtrosDelListadoSchema = zListPatientsQuery.strict();

export type FiltrosDelListado = z.output<typeof filtrosDelListadoSchema>;

/** `page` llega como texto en la query; cualquier otro valor se entrega tal cual para que Zod lo rechace. */
export function leerFiltrosDelListado(query: unknown): z.ZodSafeParseResult<FiltrosDelListado> {
  const crudo = typeof query === 'object' && query !== null ? { ...query } : {};
  const pagina = 'page' in crudo ? crudo.page : undefined;
  return filtrosDelListadoSchema.safeParse({
    ...crudo,
    ...(typeof pagina === 'string' && { page: Number(pagina) }),
  });
}

export type BusquedaDePacientes = z.output<typeof zSearchPatientsBody>;
