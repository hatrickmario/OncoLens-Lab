import Link from 'next/link';
import type { PatientPage } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { TextosDePacientes } from '../../lib/pacientes/consulta';
import { mensajes, rellenar } from '../../lib/mensajes';
import { EtiquetaDeOrigen } from '../molecules/etiqueta-de-origen';

type Paciente = PatientPage['items'][number];

const CELDA = 'border-border border-b px-3 py-2 text-left align-top';

function textoDeFaltantes(n: number, textos: TextosDePacientes['tabla']): string {
  return n === 1 ? textos.faltanteUno : rellenar(textos.faltantesN, { n });
}

/** Identificación enmascarada: el nombre enlaza a la ficha; la máscara y el año distinguen a los homónimos. */
function CeldaDelPaciente({ paciente, textos }: { paciente: Paciente; textos: TextosDePacientes }) {
  if (paciente.view === 'admin') {
    return <span>{paciente.nationalIdMasked}</span>;
  }
  return (
    <Link href={`/pacientes/${paciente.id}`} className="text-primary flex flex-col font-semibold">
      <span>{paciente.fullNameMasked}</span>
      <span className="text-text font-normal">{paciente.nationalIdMasked}</span>
      <span className="text-text-muted text-sm font-normal">
        {rellenar(textos.tabla.anioNacimiento, { anio: paciente.birthYear })}
      </span>
    </Link>
  );
}

/** Contadores y alcance: avisos informativos que no bloquean (RN-26); el admin no ve datos clínicos. */
function CeldasClinicas({ paciente, textos }: { paciente: Paciente; textos: TextosDePacientes }) {
  if (paciente.view === 'admin') {
    return (
      <td colSpan={3} className={CELDA}>
        {textos.tabla.sinDato}
      </td>
    );
  }
  return (
    <>
      <td className={CELDA}>{textoDeFaltantes(paciente.missingCriticalCount, textos.tabla)}</td>
      <td className={CELDA}>
        {rellenar(textos.tabla.porRevisarN, { n: paciente.pendingReviewCount })}
      </td>
      <td className={CELDA}>
        {paciente.cancerTypeEnabled ? '' : mensajes().alcance.tipoNoHabilitado}
      </td>
    </>
  );
}

function FilaDePaciente({ paciente, textos }: { paciente: Paciente; textos: TextosDePacientes }) {
  return (
    <tr>
      <th scope="row" className={CELDA}>
        <CeldaDelPaciente paciente={paciente} textos={textos} />
      </th>
      <CeldasClinicas paciente={paciente} textos={textos} />
      <td className={CELDA}>{textos.estados[paciente.lifecycleStatus]}</td>
      <td className={CELDA}>
        <EtiquetaDeOrigen origen={paciente.dataOrigin} textos={textos} />
      </td>
    </tr>
  );
}

/** Tabla de pacientes con identidad enmascarada; contenedor con scroll propio para no desbordar la página. */
export function TablaDePacientes({
  items,
  textos,
}: {
  items: Paciente[];
  textos: TextosDePacientes;
}) {
  const { tabla } = textos;
  const columnas = [
    tabla.paciente,
    tabla.faltantes,
    tabla.porRevisar,
    tabla.alcance,
    tabla.estado,
    tabla.origen,
  ];
  return (
    <div className="bg-surface rounded-tarjeta border-border overflow-x-auto border">
      <table className="w-full border-collapse">
        <caption className="sr-only">{tabla.descripcion}</caption>
        <thead className="bg-surface-alt">
          <tr>
            {columnas.map((columna) => (
              <th key={columna} scope="col" className={CELDA}>
                {columna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((paciente) => (
            <FilaDePaciente key={paciente.id} paciente={paciente} textos={textos} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
