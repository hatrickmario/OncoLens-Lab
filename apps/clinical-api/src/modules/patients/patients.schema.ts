import type { z } from 'zod';
import type { IdType } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { normalizarNombre } from '../../infrastructure/crypto/indice-ciego.js';
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

/** Campos que `PatientSearchRequest` declara (`additionalProperties: false`, que el Zod generado no hace cumplir). */
export const CAMPOS_DE_LA_BUSQUEDA: ReadonlySet<string> = new Set([
  'idType',
  'nationalId',
  'name',
  'page',
]);

function soloCamposDelContrato(cuerpo: unknown): boolean {
  return (
    typeof cuerpo === 'object' &&
    cuerpo !== null &&
    Object.keys(cuerpo).every((campo) => CAMPOS_DE_LA_BUSQUEDA.has(campo))
  );
}

export type CriterioDeBusqueda =
  | { readonly tipo: 'documento'; readonly idType: IdType; readonly nationalId: string }
  | { readonly tipo: 'nombre'; readonly name: string };

export interface BusquedaDePacientes {
  readonly criterio: CriterioDeBusqueda;
  readonly page: number;
}

/**
 * Valida el cuerpo de la búsqueda con el Zod generado y exige un criterio completo: documento (`idType` y
 * `nationalId`) o nombre. Si trae ambos gana el documento (design D4).
 */
export function leerBusqueda(cuerpo: unknown): BusquedaDePacientes | undefined {
  if (!soloCamposDelContrato(cuerpo)) return undefined;
  const leido = zSearchPatientsBody.safeParse(cuerpo);
  if (!leido.success) return undefined;
  const { idType, nationalId, name, page } = leido.data;
  if (idType !== undefined && nationalId !== undefined) {
    return { criterio: { tipo: 'documento', idType, nationalId }, page };
  }
  // Un nombre que queda vacío tras normalizar (solo espacios o marcas) no identifica a nadie: 422, no una búsqueda.
  if (name === undefined || normalizarNombre(name) === '') return undefined;
  return { criterio: { tipo: 'nombre', name }, page };
}
