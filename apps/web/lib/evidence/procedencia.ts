import { mensajes } from '../mensajes';

/** RN-25: un metadato ausente del catálogo se muestra como "No disponible", nunca se omite ni se rellena. */
export function valorONoDisponible(valor: string | null | undefined): string {
  return valor && valor.trim() !== '' ? valor : mensajes().evidence.cita.noDisponible;
}

/** Solo `https:`; `http:` únicamente en `localhost` y `*.test` (corpus sintético local). */
export function esUrlHttpSegura(url: string | null | undefined): boolean {
  if (!url) return false;
  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    return false;
  }
  if (analizada.protocol === 'https:') return true;
  const host = analizada.hostname;
  return analizada.protocol === 'http:' && (host === 'localhost' || host.endsWith('.test'));
}
