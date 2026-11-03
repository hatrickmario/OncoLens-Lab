import { z } from 'zod';

/**
 * Regla de la pregunta del oncólogo (US-250, design D1): Unicode NFC, todo espacio en blanco Unicode colapsado a un
 * único U+0020 y recortado en los extremos. No toca mayúsculas, signos ni puntuación. NFC y no NFKC: NFKC cambiaría
 * símbolos con significado clínico. La clase de espacios es explícita (no `\s`) para que el gemelo Python
 * (`app/domain/pregunta.py`) acepte exactamente los mismos separadores; los dos recorren la tabla
 * `fixtures/normalizacion-pregunta.json`.
 */
const ESPACIOS_UNICODE =
  /[\t\n\v\f\r \u{85}\u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}]+/gu;

/** Un único espacio en cada extremo (ya colapsado); `trim()` quitaría además U+FEFF y divergiría de Python. */
const BORDES = /^ | $/g;

export function normalizarPregunta(texto: string): string {
  return texto.normalize('NFC').replace(ESPACIOS_UNICODE, ' ').replace(BORDES, '');
}

/**
 * Esquema del borde: normaliza y después aplica los límites del contrato (`minLength`/`maxLength` del Zod generado,
 * que se pasa por parámetro para no duplicar el 2000). La longitud se mide sobre el texto ya normalizado (AC-3).
 */
export function esquemaPreguntaNormalizada<S extends z.ZodType<string, string>>(
  limitesDelContrato: S,
) {
  return z.string().transform(normalizarPregunta).pipe(limitesDelContrato);
}
