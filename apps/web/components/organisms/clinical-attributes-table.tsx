import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativa } from '../atoms/fecha-relativa';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';

type Atributo = CaseView['attributes'][number];

const CELDA = 'border-border border-b px-3 py-2 text-left align-top';

/** Atributos clínicos (atributo, valor, fecha, origen) en el orden del servidor; sin rótulo se muestra el valor crudo. */
export function ClinicalAttributesTable({
  atributos,
  hoy,
}: {
  atributos: Atributo[];
  hoy: string;
}) {
  const { caso, ficha } = mensajes();
  const c = caso.columnas;
  return (
    <SeccionDeFicha id="caso-atributos" titulo={caso.secciones.atributos}>
      {atributos.length === 0 ? (
        <p className="m-0">{caso.sinDatos}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="bg-surface-alt">
            <tr>
              {[c.atributo, c.valor, c.fecha, c.origen].map((columna) => (
                <th key={columna} scope="col" className={CELDA}>
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {atributos.map((a) => (
              <tr key={`${a.key}-${a.value}`}>
                <th scope="row" className={`${CELDA} font-semibold`}>
                  {rotuloOValor(caso.atributosClave, a.key)}
                </th>
                <td className={CELDA}>{rotuloOValor(caso.valoresDeAtributo, a.value)}</td>
                <td className={CELDA}>
                  {a.observedAt === null ? (
                    ficha.noRegistrado
                  ) : (
                    <FechaRelativa fecha={a.observedAt} hoy={hoy} />
                  )}
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
