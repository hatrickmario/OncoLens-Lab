import { mensajes } from '../../lib/mensajes';

/**
 * Aviso de que el checklist de datos críticos no se pudo calcular (panel y ficha, RN-26): informa sin bloquear,
 * nunca muestra un contador 0 ni «sin faltantes» porque no se sabe si faltan datos.
 */
export function ChecklistNoDisponible({
  idResumen,
  mensaje = mensajes().faltantes.noVerificables,
}: {
  idResumen?: string;
  /** Texto del aviso; el panel y la ficha usan el suyo, la columna de la vista de caso otro (D8). */
  mensaje?: string;
}) {
  return (
    <div
      role="status"
      className="rounded-control border-warn-border bg-warn-bg text-warn mb-4 border p-3"
    >
      <p id={idResumen} className="m-0">
        {mensaje}
      </p>
    </div>
  );
}
