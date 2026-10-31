import listaVersionada from '../../../../packages/clinical-catalogs/lenguaje/terminos-prohibidos.json';
import { checkProhibitedTerms } from '../../../../packages/clinical-language/src/check-prohibited-terms';
import type { ListaTerminos } from '../../../../packages/clinical-language/src/tipos';

/**
 * La lista versionada (RN-23) se importa como dato: el navegador no lee archivos. Su forma la valida
 * `parseProhibitedTerms` en el test de este módulo.
 */
const lista = listaVersionada as unknown as ListaTerminos;

/**
 * RN-23: devuelve `texto` si no contiene términos prohibidos de salida generada (Nivel A) y `null` si
 * los contiene. Quien presenta texto generado nunca lo renderiza cuando devuelve `null`.
 */
export function mostrarSiPermitido(texto: string): string | null {
  return checkProhibitedTerms(texto, lista).length === 0 ? texto : null;
}
