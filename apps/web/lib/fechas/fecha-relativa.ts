import { formatearFecha } from '../ficha/presentacion';
import { mensajes, rellenar } from '../mensajes';

const MS_POR_DIA = 86_400_000;
const FORMA_ISO = /^\d{4}-\d{2}-\d{2}/;

function partesDe(iso: string): [number, number, number] {
  const [anio, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return [anio!, mes!, dia!];
}

function diasEntre(desde: string, hasta: string): number {
  const [a, m, d] = partesDe(desde);
  const [a2, m2, d2] = partesDe(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a, m - 1, d)) / MS_POR_DIA);
}

/** Meses de calendario completos entre dos fechas (el mes cuenta al cumplirse el día). */
function mesesCompletos(desde: string, hasta: string): number {
  const [a, m, d] = partesDe(desde);
  const [a2, m2, d2] = partesDe(hasta);
  return (a2 - a) * 12 + (m2 - m) - (d2 < d ? 1 : 0);
}

/**
 * Fecha relativa a `hoy` (design D5, `[S5 resp. 11d]`): «hoy», «hace n días» hasta 30, «hace n meses» hasta 23 meses y
 * «hace n años» desde 24 meses. Una fecha futura o inválida se muestra absoluta (dd/mm/aaaa). Pura: `hoy` entra por
 * parámetro, nunca se lee el reloj aquí.
 */
export function fechaRelativa(fecha: string, hoy: string): string {
  if (!FORMA_ISO.test(fecha) || !FORMA_ISO.test(hoy)) return fecha;
  const { fecha: texto } = mensajes();
  const dias = diasEntre(fecha, hoy);
  if (dias < 0) return formatearFecha(fecha);
  if (dias === 0) return texto.hoy;
  if (dias <= 30) return dias === 1 ? texto.dia1 : rellenar(texto.diasN, { n: dias });
  const meses = Math.max(1, mesesCompletos(fecha, hoy));
  if (meses < 24) return meses === 1 ? texto.mes1 : rellenar(texto.mesesN, { n: meses });
  const anios = Math.floor(meses / 12);
  return anios === 1 ? texto.anio1 : rellenar(texto.aniosN, { n: anios });
}
