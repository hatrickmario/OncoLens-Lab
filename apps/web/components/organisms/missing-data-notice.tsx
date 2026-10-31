import {
  debeContinuarConAviso,
  enlaceDeRegistro,
  type LecturaDelChecklist,
} from '../../lib/evidence/faltantes';
import { mensajes, rellenar } from '../../lib/mensajes';
import { ChecklistNoDisponible } from '../molecules/checklist-no-disponible';
import { EnlaceDeRegistro } from '../molecules/enlace-de-registro';
import { ScopeNotice } from '../molecules/scope-notice';

/** Id del resumen del aviso: el botón «Analizar evidencia» lo referencia con `aria-describedby` (US-005 AC-7). */
export const ID_RESUMEN_DE_FALTANTES = 'aviso-faltantes-resumen';

/** Id del resumen que el botón referencia, o `undefined` si el aviso no muestra resumen. */
export function idDelResumenDeAviso(lectura: LecturaDelChecklist | null): string | undefined {
  return lectura && debeContinuarConAviso(lectura) ? ID_RESUMEN_DE_FALTANTES : undefined;
}

/**
 * Aviso previo al análisis (US-005, FR-23): faltantes con enlace a la ficha, checklist caído, o tipo no habilitado.
 * Siempre informativo (RN-26): no envía nada ni deshabilita el botón. Solo etiquetas del catálogo, como texto.
 */
export function MissingDataNotice({
  lectura,
  patientId,
}: {
  lectura: LecturaDelChecklist | null;
  patientId: string;
}) {
  const t = mensajes().faltantes;
  if (lectura === null || lectura.tipo === 'sin_sesion') return null;
  if (lectura.tipo === 'no_disponible')
    return <ChecklistNoDisponible idResumen={ID_RESUMEN_DE_FALTANTES} />;
  if (!lectura.cancerTypeEnabled) return <ScopeNotice />;
  const { faltantes } = lectura;
  if (faltantes.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-control border-warn-border bg-warn-bg text-warn mb-4 border p-3"
    >
      <p id={ID_RESUMEN_DE_FALTANTES} className="m-0 font-semibold">
        <span aria-hidden="true">⚠ </span>
        {faltantes.length === 1 ? t.tituloUno : rellenar(t.tituloVarios, { n: faltantes.length })}
      </p>
      <ul className="m-0 list-none p-0">
        {faltantes.map((item) => (
          <li key={item.item}>
            {item.label} <span aria-hidden="true">→</span>{' '}
            <EnlaceDeRegistro etiqueta={item.label} href={enlaceDeRegistro(patientId, item)} />
          </li>
        ))}
      </ul>
      <p className="m-0">{t.nota}</p>
    </div>
  );
}
