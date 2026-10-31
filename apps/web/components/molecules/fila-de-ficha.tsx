import type { ReactNode } from 'react';

const CELDA = 'border-border border-b px-3 py-2 text-left align-top';

/** Fila título-valor de una tabla de la ficha; el título es la cabecera de fila (`th scope="row"`). */
export function FilaDeFicha({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className={`${CELDA} bg-surface-alt w-48 font-semibold`}>
        {titulo}
      </th>
      <td className={CELDA}>{children}</td>
    </tr>
  );
}

/** Sección de la ficha con su título como nombre de región; la tabla se desplaza dentro de su contenedor. */
export function SeccionDeFicha({
  id,
  titulo,
  children,
}: {
  id: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="bg-surface rounded-tarjeta border-border mb-4 border p-4"
    >
      <h2 id={id} tabIndex={-1} className="m-0 mb-3 text-lg font-semibold">
        {titulo}
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
