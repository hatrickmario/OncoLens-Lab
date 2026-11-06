import { zPriorTreatmentManualCreate } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../../lib/mensajes';
import { CampoDeTexto } from './campo-de-texto';
import { CampoDeSeleccion } from './campo-de-seleccion';
import { diaOVacio, type TratamientoInicial } from './campos-de-tratamiento';

const MOTIVOS = zPriorTreatmentManualCreate.shape.endReason.unwrap().options;

/** Fecha y motivo de fin de un tratamiento terminado; un tratamiento en curso no los lleva (contrato). */
export function CamposDeFinDeTratamiento({
  errorDe,
  inicial,
}: {
  errorDe: (campo: string) => string | undefined;
  /** Fila que se corrige; sin ella, el formulario de alta empieza vacío. */
  inicial?: TratamientoInicial;
}) {
  const { tratamiento: t, atributo } = mensajes().caso.registro;
  const { motivosDeFin } = mensajes().caso;
  return (
    <>
      <CampoDeTexto
        id="tp-fin"
        name="endedAt"
        type="date"
        defaultValue={diaOVacio(inicial?.endedAt)}
        etiqueta={t.fin}
        error={errorDe('endedAt')}
      />
      <CampoDeSeleccion
        id="tp-motivo"
        name="endReason"
        defaultValue={inicial?.endReason ?? ''}
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
