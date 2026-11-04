import { ValorFueraDeCatalogoError } from '../compartido/errores-de-registro.js';
import type { AtributoPermitido, PrecisionDeFecha } from './ports.js';

/**
 * RN-29, ÚNICO sitio donde se decide si un atributo es registrable: la clave debe estar declarada para el tipo de
 * cáncer y el valor en su lista. Lanza con el NOMBRE del campo que falla (`attributeKey` o `value`), nunca con su valor.
 */
export function exigirAtributoPermitido(
  permitidos: readonly AtributoPermitido[],
  atributo: { readonly attributeKey: string; readonly value: string },
): void {
  const declarado = permitidos.find((p) => p.key === atributo.attributeKey);
  if (declarado === undefined) throw new ValorFueraDeCatalogoError('attributeKey');
  if (!declarado.values.some((v) => v.value === atributo.value)) {
    throw new ValorFueraDeCatalogoError('value');
  }
}

/** Con fecha de observación la precisión es de día; sin ella es incierta (la fecha queda nula, AC-02.2). */
export function precisionDeFecha(observedAt: string | undefined): PrecisionDeFecha {
  return observedAt === undefined ? 'incierta' : 'dia';
}
