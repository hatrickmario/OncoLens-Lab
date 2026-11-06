import type { ReactNode } from 'react';
import { CELDA } from './encabezado-de-tabla';

export interface FilaConHistoricoProps {
  /** Celdas de lectura de la fila. */
  children: ReactNode;
  /** Botón de «Corregir dato» (con su diálogo) de la última celda. */
  accion: ReactNode;
  /** Número de columnas de lectura de la tabla; la acción añade una. */
  columnas: number;
  /** «▸ Histórico» bajo la fila; `null` si el dato no tiene versiones anteriores (D11). */
  historico: ReactNode;
}

/** Un dato corregible de una tabla: sus celdas, su acción y, si lo corrigieron, el histórico bajo la fila (un `<tbody>` por dato). */
export function FilaConHistorico({ children, accion, columnas, historico }: FilaConHistoricoProps) {
  return (
    <tbody>
      <tr>
        {children}
        <td className={CELDA}>{accion}</td>
      </tr>
      {historico !== null && (
        <tr>
          <td colSpan={columnas + 1} className={CELDA}>
            {historico}
          </td>
        </tr>
      )}
    </tbody>
  );
}
