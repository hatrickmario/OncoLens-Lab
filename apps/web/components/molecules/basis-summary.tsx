import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { EstadoDelAnalisis } from '../../lib/evidence/estado-del-analisis';
import { describirBusqueda } from '../../lib/evidence/describir-busqueda';
import { formatearFechaDeCorte, resumirBase } from '../../lib/evidence/resumen-base';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

export interface BasisSummaryProps {
  base: AnalysisBasis;
  estado: EstadoDelAnalisis;
}

/** Resumen siempre visible de la Base (S2-09): cifras, supuestos declarados, fecha de corte y, si aplica, qué se buscó. */
export function BasisSummary({ base, estado }: BasisSummaryProps) {
  const { resumen, fechaDeCorte, supuestoDeRegla } = mensajes().evidence.base;
  const cifras = resumirBase(base);
  const busqueda = describirBusqueda(base.sourcesConsulted, estado);
  return (
    <div className={estilos.resumenBase}>
      <p>
        {rellenar(resumen, {
          faltantes: cifras.faltantes,
          supuestos: cifras.supuestos,
          noIncluidas: cifras.fuentesNoIncluidas,
          omitidas: cifras.omitidas,
        })}
      </p>
      {cifras.supuestosDeReglaCatalogo.map((texto, indice) => (
        <p key={`${indice}-${texto}`}>{rellenar(supuestoDeRegla, { texto })}</p>
      ))}
      {busqueda && <p>{busqueda}</p>}
      <p>{rellenar(fechaDeCorte, { fecha: formatearFechaDeCorte(base.corpusCutoffDate) })}</p>
    </div>
  );
}
