import Link from 'next/link';
import type { PatientSummary } from '../../../../packages/api-contracts/src/types/clinical-api';
import { contarSinVerificar } from '../../lib/ficha/contar-sin-verificar';
import { mensajes } from '../../lib/mensajes';
import { ChecklistNoDisponible } from '../molecules/checklist-no-disponible';
import { FocoPorAncla } from '../molecules/foco-por-ancla';
import { PendingReviewNotice } from '../molecules/pending-review-notice';
import { ActiveDiagnosisTable } from './active-diagnosis-table';
import { PatientHeaderBar } from './patient-header-bar';
import { PatientSummaryCard } from './patient-summary-card';
import { RecentBiomarkersTable } from './recent-biomarkers-table';

/** Ficha mínima del doctor (S2-04); "Analizar evidencia" siempre disponible: los avisos no bloquean (RN-26). */
export function FichaDelDoctor({ ficha }: { ficha: PatientSummary }) {
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
      <ActiveDiagnosisTable diagnostico={ficha.diagnosis} />
      <RecentBiomarkersTable biomarcadores={ficha.recentBiomarkers} />
      <Link
        href={`/pacientes/${ficha.id}/analisis`}
        className="bg-primary rounded-control inline-flex min-h-11 items-center px-4 font-semibold text-white"
      >
        {mensajes().ficha.acciones.analizar}
      </Link>
    </>
  );
}
