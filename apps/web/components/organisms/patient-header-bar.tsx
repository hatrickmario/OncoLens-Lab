import type { PatientSummary } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { EtiquetaDeOrigen } from '../molecules/etiqueta-de-origen';

/** Resumen del diagnóstico para la barra: tipo, CIE-10 y estadio, o "No registrado". */
function resumenDelDiagnostico({ diagnosis }: PatientSummary): string {
  if (diagnosis === null) return mensajes().ficha.noRegistrado;
  const { cancerType, icd10Code, stagingSystem, stageValue } = diagnosis;
  return [cancerType, icd10Code, `${stagingSystem} ${stageValue}`].filter(Boolean).join(' · ');
}

/** Barra del paciente (S2-00): nombre descifrado como h1, documento, año, diagnóstico y origen. Solo la ficha y su barra la muestran. */
export function PatientHeaderBar({ ficha }: { ficha: PatientSummary }) {
  const { pacientes } = mensajes();
  const { idType, nationalId, fullName } = ficha.identification;
  return (
    <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
      <h1 className="m-0 text-2xl font-semibold">{fullName}</h1>
      <EtiquetaDeOrigen origen={ficha.dataOrigin} textos={pacientes} />
      <p className="text-text-muted m-0 basis-full">
        {pacientes.tiposDeDocumento[idType]} {nationalId} · {ficha.birthYear} ·{' '}
        {resumenDelDiagnostico(ficha)}
      </p>
    </header>
  );
}
