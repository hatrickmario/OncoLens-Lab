/**
 * Globs de rutas del repositorio (separador `/`): `**` cruza directorios, `*` y `?` no, `{a,b}` alterna.
 * Módulo puro: lo comparten las exclusiones y la allowlist del escáner de PII.
 */

const ESPECIALES = /[.+^$()|[\]\\]/g;

/** Motivo por el que el glob no es válido (llave `{` sin cierre), o `null`. */
export function validarGlob(glob) {
  return [...glob].some((caracter, i) => caracter === '{' && glob.indexOf('}', i) === -1) ? 'llave { sin cerrar' : null;
}

/** Convierte un glob en una expresión regular anclada a la ruta completa. */
export function globARegExp(glob) {
  const motivo = validarGlob(glob);
  if (motivo) throw new Error(`glob inválido (${glob}): ${motivo}`);
  let fuente = '';
  for (let i = 0; i < glob.length; i += 1) {
    const caracter = glob[i];
    if (caracter === '*') {
      if (glob[i + 1] === '*') {
        const sigueBarra = glob[i + 2] === '/';
        fuente += sigueBarra ? '(?:.*/)?' : '.*';
        i += sigueBarra ? 2 : 1;
      } else {
        fuente += '[^/]*';
      }
    } else if (caracter === '?') {
      fuente += '[^/]';
    } else if (caracter === '{') {
      const cierre = glob.indexOf('}', i);
      const alternativas = glob.slice(i + 1, cierre).split(',').map((alternativa) => alternativa.replace(ESPECIALES, '\\$&'));
      fuente += `(?:${alternativas.join('|')})`;
      i = cierre;
    } else {
      fuente += caracter.replace(ESPECIALES, '\\$&');
    }
  }
  return new RegExp(`^${fuente}$`);
}

/** ¿La ruta (relativa, con `/`) casa con el glob? */
export function casaConGlob(ruta, glob) {
  return globARegExp(glob).test(ruta);
}
