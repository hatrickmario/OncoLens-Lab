import type { PatientSummary } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { FilaDeFicha, SeccionDeFicha } from '../molecules/fila-de-ficha';

/** Identificación del doctor (S2-04): documento completo, año de nacimiento y estado. La vista admin tiene la suya. */
export function PatientSummaryCard({ ficha }: { ficha: PatientSummary }) {
  const { ficha: textos, pacientes } = mensajes();
  const t = textos.identificacion;
  const { idType, nationalId } = ficha.identification;
  return (
    <SeccionDeFicha id="ficha-identificacion" titulo={t.titulo}>
      <table className="w-full border-collapse">
        <tbody>
          <FilaDeFicha titulo={t.documento}>
            {pacientes.tiposDeDocumento[idType]} {nationalId}
          </FilaDeFicha>
          <FilaDeFicha titulo={t.anioNacimiento}>{ficha.birthYear}</FilaDeFicha>
          <FilaDeFicha titulo={t.estado}>{pacientes.estados[ficha.lifecycleStatus]}</FilaDeFicha>
        </tbody>
      </table>
    </SeccionDeFicha>
  );
}
