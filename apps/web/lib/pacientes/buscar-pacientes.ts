import type { PatientSearchRequest } from '../../../../packages/api-contracts/src/types/clinical-api';
import { interpretarRespuestaDePacientes, type ResultadoDePacientes } from './respuesta';

/** Criterio ya validado: documento (tipo y número) o nombre completo. Viaja solo en el cuerpo del POST. */
export type CriterioDeBusqueda = Pick<PatientSearchRequest, 'idType' | 'nationalId' | 'name'>;

/**
 * Busca por `POST /api/patients/search` (BFF). La identidad va en el cuerpo, nunca en la URL ni en el historial; el
 * navegador añade `Origin` y la cookie `SameSite=Strict`. Un fallo de red es un error sin `traceId`.
 */
export async function buscarPacientes(criterio: CriterioDeBusqueda): Promise<ResultadoDePacientes> {
  try {
    const respuesta = await fetch('/api/patients/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(criterio),
      cache: 'no-store',
    });
    return interpretarRespuestaDePacientes(
      respuesta.status,
      await respuesta.text(),
      respuesta.headers.get('x-trace-id'),
    );
  } catch {
    return { tipo: 'error' };
  }
}
