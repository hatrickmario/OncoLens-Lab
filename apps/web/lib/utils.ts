import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases condicionales y resuelve los conflictos de Tailwind (la última gana). */
export function cn(...clases: ClassValue[]) {
  return twMerge(clsx(clases));
}
