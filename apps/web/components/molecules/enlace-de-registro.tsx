import Link from 'next/link';
import { mensajes } from '../../lib/mensajes';

/**
 * «Registrar ‹etiqueta› en la ficha»: la etiqueta del catálogo completa el nombre accesible y se oculta a la vista
 * porque el ítem ya la muestra. Texto de React, sin HTML del servidor.
 */
export function EnlaceDeRegistro({ etiqueta, href }: { etiqueta: string; href: string }) {
  const { registrar, enLaFicha } = mensajes().faltantes;
  return (
    <Link href={href} className="text-primary inline-block py-1 font-semibold underline">
      {registrar} <span className="sr-only">{etiqueta}</span> {enLaFicha}
    </Link>
  );
}
