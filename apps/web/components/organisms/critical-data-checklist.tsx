import type { LecturaDelChecklist } from '../../lib/evidence/faltantes';
import { ANCLAS_DE_CASO } from '../../lib/ficha/anclas';
import { mensajes, rellenar } from '../../lib/mensajes';
import { ChecklistNoDisponible } from '../molecules/checklist-no-disponible';
import { FilaDeDatoCritico } from '../molecules/fila-de-dato-critico';
import { FocoPorAncla } from '../molecules/foco-por-ancla';
import { ScopeNotice } from '../molecules/scope-notice';

export interface CriticalDataChecklistProps {
  /** `null` mientras no hay primera lectura. */
  lectura: LecturaDelChecklist | null;
  pacienteId: string;
  /** Paciente egresado (RN-17): se muestran los estados sin acciones de registro. */
  egresado: boolean;
  alGuardar: () => void;
}

function CuerpoDelChecklist({
  lectura,
  pacienteId,
  egresado,
  alGuardar,
}: CriticalDataChecklistProps) {
  const t = mensajes().datosCriticos;
  if (lectura === null || lectura.tipo === 'sin_sesion') {
    return (
      <p role="status" aria-busy="true" className="text-text-muted m-0">
        {t.cargando}
      </p>
    );
  }
  if (lectura.tipo === 'no_disponible') return <ChecklistNoDisponible mensaje={t.noCalculable} />;
  if (!lectura.cancerTypeEnabled) return <ScopeNotice />;
  const { faltantes } = lectura;
  return (
    <>
      <p className="text-text-muted m-0 mb-2 text-sm">
        {rellenar(t.catalogo, { version: lectura.catalogVersion })} ·{' '}
        {faltantes.length === 1 ? t.contadorUno : rellenar(t.contador, { n: faltantes.length })}
      </p>
      <ul className="m-0 list-none p-0">
        {lectura.items.map((item) => (
          <FilaDeDatoCritico
            key={item.item}
            item={item}
            pacienteId={pacienteId}
            conAcciones={!egresado}
            alGuardar={alGuardar}
          />
        ))}
      </ul>
      {egresado && (
        <p className="text-text-muted m-0 mt-2 text-sm">{mensajes().ficha.correccion.egresado}</p>
      )}
      <p className="m-0 mt-2 text-sm">{t.nota}</p>
    </>
  );
}

/**
 * Columna «Datos críticos» de la vista de caso (US-004, S5-02): una fila por ítem del checklist con su estado en texto y
 * la acción manual de cada faltante. Los avisos no bloquean (RN-26); sin estado propio: lee la lectura que le pasa la vista.
 */
export function CriticalDataChecklist(props: CriticalDataChecklistProps) {
  return (
    <section aria-labelledby="datos-criticos">
      <FocoPorAncla anclas={ANCLAS_DE_CASO} />
      <h2 id="datos-criticos" tabIndex={-1} className="m-0 mb-2 text-xl font-semibold">
        {mensajes().datosCriticos.titulo}
      </h2>
      <CuerpoDelChecklist {...props} />
    </section>
  );
}
