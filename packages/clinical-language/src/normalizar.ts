/**
 * Normalización común de RN-23 (design D3). El gemelo Python (`app/domain/lenguaje.py`) aplica los mismos
 * pasos: las reglas son operaciones de sufijo sobre cadenas ya normalizadas, idénticas en ambos lenguajes.
 */

const LONGITUD_MINIMA_PARA_FLEXION = 4;
const ENCLITICO = /(ar|er|ir)(los|las|les|lo|la|le|se)$/;

/** Normalización base: NFKD sin marcas, minúsculas, todo lo que no es letra ni dígito a espacio, espacios colapsados. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Palabras de la normalización base (vacío si no hay ninguna). */
export function palabrasDe(texto: string): string[] {
  const normalizado = normalizarTexto(texto);
  return normalizado === '' ? [] : normalizado.split(' ');
}

/**
 * Clave flexiva de una palabra ya normalizada (design D3, reglas a–d en este orden; cada una solo si la
 * palabra tiene en ese momento al menos 4 letras): enclítico, plural nominal, plural verbal, género.
 */
export function claveFlexiva(palabra: string): string {
  let clave = palabra;
  const aplica = () => clave.length >= LONGITUD_MINIMA_PARA_FLEXION;
  if (aplica()) clave = clave.replace(ENCLITICO, '$1');
  if (aplica() && clave.endsWith('s')) clave = clave.slice(0, -1);
  if (aplica() && /(an|en)$/.test(clave)) clave = clave.slice(0, -1);
  if (aplica() && /[aeo]$/.test(clave)) clave = clave.slice(0, -1);
  return clave;
}

/** Claves flexivas de cada palabra del texto. */
export function clavesDe(texto: string): string[] {
  return palabrasDe(texto).map(claveFlexiva);
}
