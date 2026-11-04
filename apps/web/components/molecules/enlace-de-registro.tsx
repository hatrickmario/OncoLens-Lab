import Link from 'next/link';
import { mensajes, rellenar } from '../../lib/mensajes';

/**
 * Enlace de un dato que falta: a la ficha («Registrar ‹etiqueta› en la ficha», la etiqueta se oculta a la vista porque
 * el criterio ya la muestra) o a la vista de caso («Ir a ‹etiqueta› en el caso clínico», con la etiqueta visible).
 * Texto de React, sin HTML del servidor.
 */
export function EnlaceDeRegistro({
  etiqueta,
  href,
  destino = 'ficha',
}: {
  etiqueta: string;
  href: string;
  destino?: 'ficha' | 'caso';
}) {
  const { registrar, enLaFicha, enElCaso } = mensajes().faltantes;
  const clases = 'text-primary inline-block py-1 font-semibold underline';
  if (destino === 'caso') {
    return (
      <Link href={href} className={clases}>
        {rellenar(enElCaso, { etiqueta })}
      </Link>
    );
  }
  return (
    <Link href={href} className={clases}>
      {registrar} <span className="sr-only">{etiqueta}</span> {enLaFicha}
    </Link>
  );
}
