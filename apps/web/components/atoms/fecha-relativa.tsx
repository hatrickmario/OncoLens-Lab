import { fechaRelativa } from '../../lib/fechas/fecha-relativa';
import { formatearFecha } from '../../lib/ficha/presentacion';

/**
 * Fecha relativa a `hoy` (D5) con la absoluta en `dateTime` y `title`. `hoy` baja por prop desde el reloj del servidor:
 * ningún componente lee `Date.now()`.
 */
export function FechaRelativa({ fecha, hoy }: { fecha: string; hoy: string }) {
  return (
    <time dateTime={fecha.slice(0, 10)} title={formatearFecha(fecha)}>
      {fechaRelativa(fecha, hoy)}
    </time>
  );
}
