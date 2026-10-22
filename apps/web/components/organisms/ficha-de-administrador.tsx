import type { PatientAdminSummary } from '../../../../packages/api-contracts/src/types/clinical-api';
import { formatearFecha } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';
import { EtiquetaDeOrigen } from '../molecules/etiqueta-de-origen';
import { FilaDeFicha, SeccionDeFicha } from '../molecules/fila-de-ficha';

/** Vista del administrador: documento enmascarado, estado y alta; sin nombre, datos clínicos ni análisis (mínimo privilegio). */
export function FichaDeAdministrador({ ficha }: { ficha: PatientAdminSummary }) {
  const { ficha: textos, pacientes } = mensajes();
  return (
    <>
      <header className="mb-4 flex items-center gap-4">
        <h1 className="m-0 text-2xl font-semibold">{textos.admin.titulo}</h1>
        <EtiquetaDeOrigen origen={ficha.dataOrigin} textos={pacientes} />
      </header>
      <p className="text-text-muted">{textos.admin.nota}</p>
      <SeccionDeFicha id="ficha-identificacion" titulo={textos.identificacion.titulo}>
        <table className="w-full border-collapse">
          <tbody>
            <FilaDeFicha titulo={textos.identificacion.documento}>
              {ficha.nationalIdMasked}
            </FilaDeFicha>
            <FilaDeFicha titulo={textos.identificacion.estado}>
              {pacientes.estados[ficha.lifecycleStatus]}
            </FilaDeFicha>
            <FilaDeFicha titulo={textos.identificacion.registrado}>
              {formatearFecha(ficha.registeredAt)}
            </FilaDeFicha>
          </tbody>
        </table>
      </SeccionDeFicha>
    </>
  );
}
