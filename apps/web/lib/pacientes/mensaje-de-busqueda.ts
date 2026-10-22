import type { PatientPage } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rellenar } from '../mensajes';
import type { CriterioDeBusqueda } from './buscar-pacientes';
import type { TextosDePacientes } from './consulta';

/**
 * Aviso del resultado de una búsqueda ("" si no hace falta): sin coincidencias, según el criterio; y, con más de un
 * paciente con el mismo nombre (homónimos), que se distingan por el documento enmascarado y el año de nacimiento.
 */
export function mensajeDeBusqueda(
  criterio: CriterioDeBusqueda,
  pagina: PatientPage,
  textos: TextosDePacientes['busqueda'],
): string {
  const porNombre = criterio.name !== undefined;
  if (pagina.items.length === 0) {
    return porNombre ? textos.sinResultadosNombre : textos.sinResultadosDocumento;
  }
  return porNombre && pagina.items.length > 1
    ? rellenar(textos.homonimos, { n: pagina.items.length })
    : '';
}
