import type { ReactNode } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativaOpcional } from '../atoms/fecha-relativa';
import { CELDA, EncabezadoDeTabla } from '../molecules/encabezado-de-tabla';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';

type Atributo = CaseView['attributes'][number];

/** Atributos clínicos (atributo, valor, fecha, origen) en el orden del servidor; sin rótulo se muestra el valor crudo. */
export function ClinicalAttributesTable({
  atributos,
  hoy,
  accion,
}: {
  atributos: Atributo[];
  hoy: string;
  accion?: ReactNode;
}) {
  const { caso } = mensajes();
  const c = caso.columnas;
  return (
    <SeccionDeFicha id="caso-atributos" titulo={caso.secciones.atributos} accion={accion}>
      {atributos.length === 0 ? (
        <p className="m-0">{caso.sinDatos}</p>
      ) : (
        <table className="w-full border-collapse">
          <EncabezadoDeTabla columnas={[c.atributo, c.valor, c.fecha, c.origen]} />
          <tbody>
            {atributos.map((a) => (
              <tr key={`${a.key}-${a.value}`}>
                <th scope="row" className={`${CELDA} font-semibold`}>
                  {rotuloOValor(caso.atributosClave, a.key)}
                </th>
                <td className={CELDA}>{rotuloOValor(caso.valoresDeAtributo, a.value)}</td>
                <td className={CELDA}>
                  <FechaRelativaOpcional fecha={a.observedAt} hoy={hoy} />
                </td>
                <td className={CELDA}>
                  <ProcedenciaDelDato procedencia={a.provenance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SeccionDeFicha>
  );
}
