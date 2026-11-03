import type { ClinicalNote } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ListaDeNotasClinicas } from './lista-de-notas-clinicas';

export interface NotasClinicasDeFichaProps {
  /** `null` cuando la lectura falló: la ficha se muestra igual (RN-26). */
  notas: ClinicalNote[] | null;
  pacienteId: string;
  egresado: boolean;
}

const ID_DE_AYUDA = 'correccion-egresado-notas';

function ContenidoDeNotas({ notas, pacienteId, egresado }: NotasClinicasDeFichaProps) {
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
      <ListaDeNotasClinicas
        notas={notas}
        pacienteId={pacienteId}
        egresado={egresado}
        idDeAyuda={ID_DE_AYUDA}
      />
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
