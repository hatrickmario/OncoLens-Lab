import type { ReactNode } from 'react';
import type { AnclaDeFicha } from '../../lib/ficha/anclas';

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
  accion,
}: {
  id: AnclaDeFicha | 'ficha-identificacion' | 'notas-clinicas' | `caso-${string}`;
  titulo: string;
  children: ReactNode;
  /** Acción de la sección (p. ej. «+ Agregar …»), a la derecha del título. */
  accion?: ReactNode;
}) {
  const encabezado = (
    <h2 id={id} tabIndex={-1} className="m-0 text-lg font-semibold">
      {titulo}
    </h2>
  );
  return (
    <section
      aria-labelledby={id}
      className="bg-surface rounded-tarjeta border-border mb-4 border p-4"
    >
      {accion === undefined ? (
        <div className="mb-3">{encabezado}</div>
      ) : (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          {encabezado}
          {accion}
        </div>
      )}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
