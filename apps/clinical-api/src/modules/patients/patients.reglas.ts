/** Marcador de la máscara del documento: cuatro U+2022 (el formato lo fija el contrato, `nationalIdMasked`). */
const MARCADOR_DE_DOCUMENTO = '••••';
const CARACTERES_VISIBLES = 2;
const RELLENO = '0';

/**
 * Máscara del nombre: la inicial de cada palabra en mayúscula seguida de punto ("Lucía Fernanda Rondón Peña" →
 * "L. F. R. P."). No conserva ninguna palabra completa ni su longitud (RN-10, US-048 AC-7).
 */
export function enmascararNombre(nombreCompleto: string): string {
  return nombreCompleto
    .split(/\s+/)
    .filter((palabra) => palabra !== '')
    .map((palabra) => `${(Array.from(palabra)[0] ?? '').toLocaleUpperCase('es')}.`)
    .join(' ');
}

/**
 * Máscara del documento de LONGITUD FIJA: cuatro U+2022, un espacio y los 2 últimos caracteres alfanuméricos del número
 * normalizado, para todo `idType` ("1234567" → "•••• 67"; "SINT-0000001" → "•••• 01"). No revela la longitud del
 * documento; si tuviera menos de 2 caracteres se rellena a la izquierda (RN-10, US-048 AC-7).
 */
export function enmascararDocumento(numeroDeDocumento: string): string {
  // Normalización PROPIA de la máscara: `normalizarNumeroDeDocumento` define el índice ciego y está congelado.
  const visibles = numeroDeDocumento
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(-CARACTERES_VISIBLES)
    .padStart(CARACTERES_VISIBLES, RELLENO);
  return `${MARCADOR_DE_DOCUMENTO} ${visibles}`;
}
