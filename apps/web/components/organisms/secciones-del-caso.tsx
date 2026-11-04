import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { separarSinFecha } from '../../lib/caso/presentacion';
import type { LecturaDelChecklist } from '../../lib/evidence/faltantes';
import { CaseTimeline } from './case-timeline';
import { ClinicalAttributesTable } from './clinical-attributes-table';
import { CriticalDataChecklist } from './critical-data-checklist';
import { DialogoAtributoClinico } from './dialogo-atributo-clinico';
import { DialogoTratamientoPrevio } from './dialogo-tratamiento-previo';
import { PriorTreatmentsTable } from './prior-treatments-table';
import { SeriesConRegistroManual } from './series-con-registro-manual';
import { UndatedEvents } from './undated-events';

export interface SeccionesDelCasoProps {
  vista: CaseView;
  /** Checklist de datos críticos; `null` mientras se lee. Su caída no oculta el resto de la vista (US-004 AC-5). */
  checklist: LecturaDelChecklist | null;
  hoy: string;
  patientId: string;
  egresado: boolean;
  /** Recarga la vista y relee el checklist tras un registro manual (`201`). */
  alRegistrar: () => void;
  /** Clave de `?item=` (US-111). */
  item?: string;
}

/** Columna «Datos críticos» (US-004) y las secciones de la vista de caso (S5-05, pantalla 07 del flujo E2E). */
export function SeccionesDelCaso({
  vista,
  checklist,
  hoy,
  patientId,
  egresado,
  alRegistrar,
  item,
}: SeccionesDelCasoProps) {
  const { fechados, sinFecha } = separarSinFecha(vista.timeline);
  const registro = { pacienteId: patientId, egresado, alGuardar: alRegistrar };
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <aside>
        <CriticalDataChecklist
          lectura={checklist}
          pacienteId={patientId}
          egresado={egresado}
          alGuardar={alRegistrar}
        />
      </aside>
      <div>
        <CaseTimeline eventos={fechados} hoy={hoy} />
        {sinFecha.length > 0 && <UndatedEvents eventos={sinFecha} />}
        <PriorTreatmentsTable
          tratamientos={vista.priorTreatments}
          hoy={hoy}
          accion={<DialogoTratamientoPrevio {...registro} />}
        />
        <ClinicalAttributesTable
          atributos={vista.attributes}
          hoy={hoy}
          accion={<DialogoAtributoClinico {...registro} />}
        />
        <SeriesConRegistroManual
          series={vista.biomarkerSeries}
          hoy={hoy}
          item={item}
          {...registro}
        />
      </div>
    </div>
  );
}
