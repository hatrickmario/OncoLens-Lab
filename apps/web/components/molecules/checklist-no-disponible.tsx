import { mensajes } from '../../lib/mensajes';

/**
 * Aviso de que el checklist de datos críticos no se pudo calcular (panel y ficha, RN-26): informa sin bloquear,
 * nunca muestra un contador 0 ni «sin faltantes» porque no se sabe si faltan datos.
 */
export function ChecklistNoDisponible({ idResumen }: { idResumen?: string }) {
  return (
    <div
      role="status"
      className="rounded-control border-warn-border bg-warn-bg text-warn mb-4 border p-3"
    >
      <p id={idResumen} className="m-0">
        {mensajes().faltantes.noVerificables}
      </p>
    </div>
  );
}
