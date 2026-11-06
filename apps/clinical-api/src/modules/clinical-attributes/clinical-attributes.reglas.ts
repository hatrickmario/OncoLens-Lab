import { ValorFueraDeCatalogoError } from '../compartido/errores-de-registro.js';
import type { AtributoPermitido, PrecisionDeFecha } from './ports.js';

/**
 * RN-29, ÚNICA regla de «el valor está en la lista del catálogo»: la comparten el alta y la corrección. Lanza con el
 * NOMBRE del campo que falla, nunca con su valor. `campoSinDeclarar` es el campo que se señala cuando la clave no está
 * declarada para el tipo de cáncer: el alta señala `attributeKey`; la corrección no admite la clave en el cuerpo y
 * señala `value` (diferencia del contrato, no se unifica aquí).
 */
export function exigirValorPermitido(
  declarado: AtributoPermitido | undefined,
  valor: string,
  campoSinDeclarar: 'attributeKey' | 'value',
): void {
  if (declarado === undefined) throw new ValorFueraDeCatalogoError(campoSinDeclarar);
  if (!declarado.values.some((v) => v.value === valor)) {
    throw new ValorFueraDeCatalogoError('value');
  }
}

/** Alta (RN-29): la clave debe estar declarada para el tipo de cáncer y el valor en su lista. */
export function exigirAtributoPermitido(
  permitidos: readonly AtributoPermitido[],
  atributo: { readonly attributeKey: string; readonly value: string },
): void {
  exigirValorPermitido(
    permitidos.find((p) => p.key === atributo.attributeKey),
    atributo.value,
    'attributeKey',
  );
}

/** Con fecha de observación la precisión es de día; sin ella es incierta (la fecha queda nula, AC-02.2). */
export function precisionDeFecha(observedAt: string | undefined): PrecisionDeFecha {
  return observedAt === undefined ? 'incierta' : 'dia';
}
