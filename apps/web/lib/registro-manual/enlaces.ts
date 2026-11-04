import { hrefDeFicha, hrefDeVistaDeCaso } from '../ficha/anclas';

export type PaginaDeRegistro = 'ficha' | 'caso';

/** Clave del catálogo (`ki67`, `grado`): minúsculas, dígitos y guion bajo; nada que arme una URL ni un selector. */
const CLAVE_DE_ITEM = /^[a-z0-9_]{1,64}$/;

/** Ruta de la página sin `item`: a donde se vuelve al cerrar un formulario abierto por URL. Precondición: UUID. */
export function rutaDeLaPagina(patientId: string, pagina: PaginaDeRegistro): string {
  return pagina === 'caso' ? hrefDeVistaDeCaso(patientId) : hrefDeFicha(patientId);
}

/**
 * Único constructor del enlace que abre el formulario de registro manual de un dato faltante (`?item=<clave>`, D7).
 * Solo lleva la clave del catálogo, nunca un valor del paciente. Precondición: `patientId` UUID e `item` clave válida;
 * cualquier otro valor lanza en vez de armar una ruta con él.
 */
export function hrefDeRegistroManual(
  patientId: string,
  item: string,
  pagina: PaginaDeRegistro,
): string {
  if (!CLAVE_DE_ITEM.test(item)) throw new Error('item debe ser una clave del catálogo');
  return `${rutaDeLaPagina(patientId, pagina)}?item=${item}`;
}

/** Valor de `searchParams.item` de una página: la clave si es válida; repetida, ausente o ajena, `undefined`. */
export function claveDeItem(valor: string | string[] | undefined): string | undefined {
  return typeof valor === 'string' && CLAVE_DE_ITEM.test(valor) ? valor : undefined;
}
