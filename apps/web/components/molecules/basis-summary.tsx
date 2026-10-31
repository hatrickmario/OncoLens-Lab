import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { EstadoDelAnalisis } from '../../lib/evidence/estado-del-analisis';
import { describirBusqueda } from '../../lib/evidence/describir-busqueda';
import {
  formatearFechaDeCorte,
  resumirBase,
  textoDeFaltantes,
} from '../../lib/evidence/resumen-base';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

export interface BasisSummaryProps {
  base: AnalysisBasis;
  estado: EstadoDelAnalisis;
}

/** Resumen siempre visible de la Base (S2-09): cifras, fecha de corte y, si aplica, qué se buscó. Solo informa (RN-26). */
export function BasisSummary({ base, estado }: BasisSummaryProps) {
  const { resumen, fechaDeCorte } = mensajes().evidence.base;
  const cifras = resumirBase(base, estado);
  const faltantes = textoDeFaltantes(cifras);
  const busqueda = describirBusqueda(base.sourcesConsulted, estado);
  const resto = rellenar(resumen, {
    supuestos: cifras.supuestos,
    noIncluidas: cifras.fuentesNoIncluidas,
    omitidas: cifras.omitidas,
  });
  const sinChecklist = cifras.faltantes === null;
  return (
    <div className={estilos.resumenBase}>
      <p>
        {sinChecklist
          ? [busqueda, faltantes].filter(Boolean).join(' · ')
          : `${faltantes} · ${resto}`}
      </p>
      {sinChecklist && <p>{resto}</p>}
      {!sinChecklist && busqueda && estado === 'con_evidencia' && (
        <section aria-label={mensajes().evidence.resultado.queSeBusco}>
          <p>{busqueda}</p>
        </section>
      )}
      {!sinChecklist && busqueda && estado !== 'con_evidencia' && <p>{busqueda}</p>}
      <p>{rellenar(fechaDeCorte, { fecha: formatearFechaDeCorte(base.corpusCutoffDate) })}</p>
    </div>
  );
}
