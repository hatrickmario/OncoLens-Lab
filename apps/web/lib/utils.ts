import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/** Nombres de los tokens `--radius-*` y `--shadow-*` de `@theme` en app/globals.css. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['etiqueta', 'control', 'tarjeta', 'dialogo'] }],
      shadow: [{ shadow: ['dialogo'] }],
    },
  },
});

/** Une clases condicionales y resuelve los conflictos de Tailwind, también los de los tokens propios (la última gana). */
export function cn(...clases: ClassValue[]) {
  return twMerge(clsx(clases));
}
