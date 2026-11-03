/** Estilo de celda compartido por las tablas de la ficha y de la vista de caso. */
export const CELDA = 'border-border border-b px-3 py-2 text-left align-top';

/** Fila de encabezados de columna (`th scope="col"`): el equivalente textual de cada tabla para lectores de pantalla. */
export function EncabezadoDeTabla({ columnas }: { columnas: string[] }) {
  return (
    <thead className="bg-surface-alt">
      <tr>
        {columnas.map((columna) => (
          <th key={columna} scope="col" className={CELDA}>
            {columna}
          </th>
        ))}
      </tr>
    </thead>
  );
}
