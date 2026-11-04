import { zPriorTreatmentManualCreate } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../../lib/mensajes';
import { CampoDeTexto } from './campo-de-texto';
import { CampoDeSeleccion } from './campo-de-seleccion';

const MOTIVOS = zPriorTreatmentManualCreate.shape.endReason.unwrap().options;

/** Fecha y motivo de fin de un tratamiento terminado; un tratamiento en curso no los lleva (contrato). */
export function CamposDeFinDeTratamiento({
  errorDe,
}: {
  errorDe: (campo: string) => string | undefined;
}) {
  const { tratamiento: t, atributo } = mensajes().caso.registro;
  const { motivosDeFin } = mensajes().caso;
  return (
    <>
      <CampoDeTexto
        id="tp-fin"
        name="endedAt"
        type="date"
        etiqueta={t.fin}
        error={errorDe('endedAt')}
      />
      <CampoDeSeleccion
        id="tp-motivo"
        name="endReason"
        defaultValue=""
        etiqueta={t.motivoDeFin}
        error={errorDe('endReason')}
      >
        <option value="">{atributo.elegir}</option>
        {MOTIVOS.map((m) => (
          <option key={m} value={m}>
            {motivosDeFin[m]}
          </option>
        ))}
      </CampoDeSeleccion>
    </>
  );
}
