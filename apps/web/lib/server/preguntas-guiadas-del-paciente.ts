import 'server-only';
import { armarPreguntasGuiadas } from '../conversacion/preguntas-guiadas';
import { catalogosGuiadas } from './catalogo-guiadas';
import { obtenerFicha } from './pacientes';

/**
 * Preguntas guiadas del paciente (US-267 AC-8…AC-10), compuestas en servidor: lee el resumen con `obtenerFicha` y de él
 * solo `diagnosis` y `recentBiomarkers`; la lista de textos es lo único que llega al cliente (nunca `identification`,
 * el resumen ni el catálogo). Si la lectura falla (`error`, sin sesión, no encontrada) o la vista no es la del doctor
 * devuelve `[]`: se ocultan las guiadas y el campo de pregunta sigue operable (RN-26: no bloquea).
 */
export async function preguntasGuiadasDelPaciente(
  cabeceraCookie: string | null,
  patientId: string,
): Promise<string[]> {
  const resultado = await obtenerFicha(cabeceraCookie, patientId);
  if (resultado.tipo !== 'ok' || resultado.ficha.view !== 'doctor') return [];
  return armarPreguntasGuiadas(resultado.ficha, catalogosGuiadas);
}
