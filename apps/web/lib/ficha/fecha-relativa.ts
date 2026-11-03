import { mensajes, rellenar } from '../mensajes';

const MS_POR_DIA = 86_400_000;

/** Día calendario UTC de una fecha o fecha-hora ISO, como número de días desde la época. */
function diaUtc(fecha: Date | string): number {
  const f = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return Math.floor(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()) / MS_POR_DIA);
}

/**
 * "hoy", "ayer", "hace 12 días", "hace 3 meses", "hace 2 años" (D8, `[S5 resp. 11]` (d)). El reloj entra por
 * parámetro; una fecha futura se trata como "hoy". Quien la muestre pone la fecha absoluta en `<time>` y `title`.
 */
export function fechaRelativa(iso: string, ahora: Date): string {
  const t = mensajes().ficha.correccion.fechaRelativa;
  const dias = Math.max(0, diaUtc(ahora) - diaUtc(iso));
  if (dias === 0) return t.hoy;
  if (dias === 1) return t.ayer;
  if (dias < 30) return rellenar(t.dias, { n: dias });
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? t.mes : rellenar(t.meses, { n: meses });
  const anios = Math.floor(dias / 365);
  return anios <= 1 ? t.anio : rellenar(t.anios, { n: anios });
}
