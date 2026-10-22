import type {
  PatientAdminSummary,
  PatientSummary,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { FilaDeFicha, SeccionDeFicha } from '../molecules/fila-de-ficha';

/** Identificación (S2-04): documento completo para el doctor, enmascarado para el administrador; año y estado. */
export function PatientSummaryCard({ ficha }: { ficha: PatientSummary | PatientAdminSummary }) {
  const { ficha: textos, pacientes } = mensajes();
  const t = textos.identificacion;
  const documento =
    ficha.view === 'doctor'
      ? `${pacientes.tiposDeDocumento[ficha.identification.idType]} ${ficha.identification.nationalId}`
      : ficha.nationalIdMasked;
  return (
    <SeccionDeFicha id="ficha-identificacion" titulo={t.titulo}>
      <table className="w-full border-collapse">
        <tbody>
          <FilaDeFicha titulo={t.documento}>{documento}</FilaDeFicha>
          {ficha.view === 'doctor' && (
            <FilaDeFicha titulo={t.anioNacimiento}>{ficha.birthYear}</FilaDeFicha>
          )}
          <FilaDeFicha titulo={t.estado}>{pacientes.estados[ficha.lifecycleStatus]}</FilaDeFicha>
        </tbody>
      </table>
    </SeccionDeFicha>
  );
}
