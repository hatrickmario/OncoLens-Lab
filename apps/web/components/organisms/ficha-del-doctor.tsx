import Link from 'next/link';
import type {
  ClinicalNote,
  PatientSummary,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { hrefDeVistaDeCaso } from '../../lib/ficha/anclas';
import { contarSinVerificar } from '../../lib/ficha/contar-sin-verificar';
import { mensajes } from '../../lib/mensajes';
import { ChecklistNoDisponible } from '../molecules/checklist-no-disponible';
import { FocoPorAncla } from '../molecules/foco-por-ancla';
import { PendingReviewNotice } from '../molecules/pending-review-notice';
import { ActiveDiagnosisTable } from './active-diagnosis-table';
import { DialogoCompletarDiagnostico } from './dialogo-completar-diagnostico';
import { DialogoRegistroBiomarcador } from './dialogo-registro-biomarcador';
import { NotasClinicasDeFicha } from './notas-clinicas-de-ficha';
import { PatientHeaderBar } from './patient-header-bar';
import { PatientSummaryCard } from './patient-summary-card';
import { RecentBiomarkersTable } from './recent-biomarkers-table';

/** Ficha mínima del doctor (S2-04); "Analizar evidencia" siempre disponible: los avisos no bloquean (RN-26). */
export function FichaDelDoctor({
  ficha,
  notas,
  hoy,
  item,
}: {
  ficha: PatientSummary;
  /** `null` si la lectura de notas falló: el resto de la ficha se muestra igual. */
  notas: ClinicalNote[] | null;
  hoy: string;
  /** Clave del catálogo de `?item=` (US-111): abre el formulario de su entidad. */
  item?: string;
}) {
  const { ficha: textos, caso } = mensajes();
  const egresado = ficha.lifecycleStatus === 'egresado';
  const registro = { pacienteId: ficha.id, egresado, pagina: 'ficha', item } as const;
  return (
    <>
      <FocoPorAncla />
      <PatientHeaderBar ficha={ficha} />
      <PendingReviewNotice
        porRevisar={ficha.pendingReviewCount}
        sinVerificar={contarSinVerificar(ficha)}
        fueraDeAlcance={!ficha.cancerTypeEnabled}
      />
      {ficha.completenessAvailable === false && <ChecklistNoDisponible />}
      <PatientSummaryCard ficha={ficha} />
      <ActiveDiagnosisTable
        diagnostico={ficha.diagnosis}
        hoy={hoy}
        accion={
          <DialogoCompletarDiagnostico
            {...registro}
            diagnostico={ficha.diagnosis}
            idDelEncabezado="diagnostico"
          />
        }
      />
      <RecentBiomarkersTable
        biomarcadores={ficha.recentBiomarkers}
        pacienteId={ficha.id}
        egresado={egresado}
        hoy={hoy}
        accion={<DialogoRegistroBiomarcador {...registro} idDelEncabezado="biomarcadores" />}
      />
      <NotasClinicasDeFicha notas={notas} pacienteId={ficha.id} egresado={egresado} hoy={hoy} />
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/pacientes/${ficha.id}/analisis`}
          className="bg-primary rounded-control inline-flex min-h-11 items-center px-4 font-semibold text-white"
        >
          {textos.acciones.analizar}
        </Link>
        <Link
          href={hrefDeVistaDeCaso(ficha.id)}
          className="border-control-border bg-surface text-text rounded-control inline-flex min-h-11 items-center border px-4 font-semibold"
        >
          {caso.verCaso}
        </Link>
      </div>
    </>
  );
}
