/** Lectura mínima de Markdown para los chequeos de `data-model.md` y del readme. */

const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Texto de la sección cuyo encabezado cumple `headingPattern`, hasta el siguiente encabezado del mismo
 * nivel o de uno superior. Ignora los `#` dentro de bloques de código.
 * @param {string} markdown
 * @param {RegExp} headingPattern se prueba contra la línea completa del encabezado
 * @returns {string | null}
 */
export function sectionOf(markdown, headingPattern) {
  const lines = markdown.split('\n');
  let level = null;
  const collected = [];
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;
    const heading = inFence ? null : line.match(HEADING);
    if (level === null) {
      if (heading && headingPattern.test(line)) {
        level = heading[1].length;
        collected.push(line);
      }
    } else if (heading && heading[1].length <= level) {
      break;
    } else {
      collected.push(line);
    }
  }
  return level === null ? null : collected.join('\n');
}

/** Contenido de cada bloque de código del texto, opcionalmente solo los de un lenguaje. */
export function codeBlocks(text, language = null) {
  const blocks = [];
  const pattern = /```([\w-]*)\n([\s\S]*?)\n```/g;
  for (const match of text.matchAll(pattern)) {
    if (language === null || match[1] === language) blocks.push(match[2]);
  }
  return blocks;
}

/** Quita los acentos graves de una celda y la recorta. */
export const cellText = (cell) => cell.replaceAll('`', '').trim();

/** Filas de las tablas Markdown del texto, como arreglos de celdas; omite las líneas separadoras. */
export function tableRows(text) {
  return text
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
}
