import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { describirBusqueda } from '../../lib/evidence/describir-busqueda';
import { formatearFechaDeCorte, resumirBase } from '../../lib/evidence/resumen-base';
import { mensajes, rellenar } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

export interface BasisSummaryProps {
  base: AnalysisBasis;
  estado: 'con_evidencia' | 'sin_evidencia' | 'tipo_no_habilitado';
}

/** Resumen siempre visible de la Base (S2-09): cifras, supuestos declarados, fecha de corte y, si aplica, qué se buscó. */
export function BasisSummary({ base, estado }: BasisSummaryProps) {
  const { resumen, fechaDeCorte } = mensajes().evidence.base;
  const cifras = resumirBase(base);
  const mostrarBusqueda = estado !== 'con_evidencia';
  return (
    <div className={estilos.resumenBase}>
      <p>
        {rellenar(resumen, {
          faltantes: cifras.faltantes,
          supuestos: cifras.supuestos,
          fuentes: cifras.fuentesNoIncluidas,
          omitidas: cifras.omitidas,
        })}
      </p>
      {cifras.supuestosDeCatalogo.map((texto) => (
        <p key={texto}>{texto}</p>
      ))}
      {mostrarBusqueda && <p>{describirBusqueda(base.sourcesConsulted, estado)}</p>}
      <p>{rellenar(fechaDeCorte, { fecha: formatearFechaDeCorte(base.corpusCutoffDate) })}</p>
    </div>
  );
}
