import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativa } from '../atoms/fecha-relativa';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';

type Tratamiento = CaseView['priorTreatments'][number];

const CELDA = 'border-border border-b px-3 py-2 text-left align-top';

function Fecha({ fecha, hoy }: { fecha: string | null; hoy: string }) {
  const { noRegistrado } = mensajes().ficha;
  return fecha === null ? <>{noRegistrado}</> : <FechaRelativa fecha={fecha} hoy={hoy} />;
}

function FilaDeTratamiento({ t, hoy }: { t: Tratamiento; hoy: string }) {
  const { caso, ficha } = mensajes();
  return (
    <tr>
      <td className={CELDA}>{t.lineNumber ?? ficha.noRegistrado}</td>
      <td className={CELDA}>{rotuloOValor(caso.contextos, t.setting)}</td>
      <th scope="row" className={`${CELDA} font-semibold`}>
        {t.regimenName}
        {t.atcCodes.length > 0 && (
          <span className="text-text-muted block text-sm font-normal">{t.atcCodes.join(', ')}</span>
        )}
      </th>
      <td className={CELDA}>
        <Fecha fecha={t.startedAt} hoy={hoy} />
      </td>
      <td className={CELDA}>
        {t.ongoing ? caso.enCurso : <Fecha fecha={t.endedAt} hoy={hoy} />}
        {!t.ongoing && (
          <span className="text-text-muted block text-sm">
            {rotuloOValor(caso.motivosDeFin, t.endReason)}
          </span>
        )}
      </td>
      <td className={CELDA}>
        <ProcedenciaDelDato procedencia={t.provenance} />
      </td>
    </tr>
  );
}

/** Tratamientos previos (línea, contexto, esquema, inicio, fin u «En curso», origen) en el orden del servidor. */
export function PriorTreatmentsTable({
  tratamientos,
  hoy,
}: {
  tratamientos: Tratamiento[];
  hoy: string;
}) {
  const { caso } = mensajes();
  const c = caso.columnas;
  return (
    <SeccionDeFicha id="caso-tratamientos" titulo={caso.secciones.tratamientos}>
      {tratamientos.length === 0 ? (
        <p className="m-0">{caso.sinDatos}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="bg-surface-alt">
            <tr>
              {[c.linea, c.contexto, c.esquema, c.inicio, c.fin, c.origen].map((columna) => (
                <th key={columna} scope="col" className={CELDA}>
                  {columna}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tratamientos.map((t) => (
              <FilaDeTratamiento key={`${t.regimenName}-${t.startedAt}`} t={t} hoy={hoy} />
            ))}
          </tbody>
        </table>
      )}
    </SeccionDeFicha>
  );
}
