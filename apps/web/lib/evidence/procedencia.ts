import { mensajes } from '../mensajes';

/** RN-25: un metadato ausente del catálogo se muestra como "No disponible", nunca se omite ni se rellena. */
export function valorONoDisponible(valor: string | null | undefined): string {
  return valor && valor.trim() !== '' ? valor : mensajes().evidence.cita.noDisponible;
}

/** Un número presente se muestra tal cual, incluido `0`; solo `null` es ausente (RN-25, design D3). */
export function numeroONoDisponible(valor: number | null | undefined): string {
  return valor == null ? mensajes().evidence.cita.noDisponible : String(valor);
}

/** Rótulo legible del código de diseño del catálogo; `null` o un código desconocido se muestran como ausentes (RN-25). */
export function rotuloDeDiseno(codigo: string | null | undefined): string {
  const { disenos } = mensajes().evidence.cita;
  const rotulo =
    codigo != null && Object.hasOwn(disenos, codigo)
      ? disenos[codigo as keyof typeof disenos]
      : null;
  return valorONoDisponible(rotulo);
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
