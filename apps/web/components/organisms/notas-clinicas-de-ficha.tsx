import type { ClinicalNote } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { FilaDeNotaClinica } from '../molecules/fila-de-nota-clinica';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';

export interface NotasClinicasDeFichaProps {
  /** `null` cuando la lectura falló: la ficha se muestra igual (RN-26). */
  notas: ClinicalNote[] | null;
  pacienteId: string;
  egresado: boolean;
  /** «Hoy» del servidor para las fechas relativas. */
  hoy: string;
}

const ID_DE_AYUDA = 'correccion-egresado-notas';

function ContenidoDeNotas({ notas, pacienteId, egresado, hoy }: NotasClinicasDeFichaProps) {
  const { notas: textos, correccion } = mensajes().ficha;
  if (notas === null) return <p className="m-0">{textos.noDisponibles}</p>;
  if (notas.length === 0) return <p className="m-0">{textos.vacio}</p>;
  return (
    <>
      {egresado && (
        <p id={ID_DE_AYUDA} className="m-0 mb-2">
          {correccion.egresado}
        </p>
      )}
      <ul className="m-0 list-none p-0">
        {notas.map((nota) => (
          <FilaDeNotaClinica
            key={nota.id}
            nota={nota}
            pacienteId={pacienteId}
            egresado={egresado}
            idDeAyuda={ID_DE_AYUDA}
            hoy={hoy}
          />
        ))}
      </ul>
    </>
  );
}

/** Notas clínicas vigentes de la ficha (US-253): texto como texto, corregibles con histórico; sin PII en el cliente. */
export function NotasClinicasDeFicha(props: NotasClinicasDeFichaProps) {
  return (
    <SeccionDeFicha id="notas-clinicas" titulo={mensajes().ficha.notas.titulo}>
      <ContenidoDeNotas {...props} />
    </SeccionDeFicha>
  );
}
