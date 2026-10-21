'use client';

import { useId, useState } from 'react';
import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { BasisDetail } from '../molecules/basis-detail';
import { BasisSummary } from '../molecules/basis-summary';

export interface AnalysisBasisPanelProps {
  base: AnalysisBasis;
  /** Estado del análisis: decide si el resumen dice qué se buscó o que no se consultó el corpus. */
  estado: 'con_evidencia' | 'sin_evidencia' | 'tipo_no_habilitado';
}

/** Base del análisis (S2-09, US-067): resumen siempre visible y detalle colapsable. Solo informa, no bloquea (RN-26). */
export function AnalysisBasisPanel({ base, estado }: AnalysisBasisPanelProps) {
  const [abierta, setAbierta] = useState(false);
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idDetalle = `${idBase}-detalle`;
  const { titulo, verDetalle, ocultarDetalle } = mensajes().evidence.base;
  return (
    <section className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <h2 id={idTitulo}>{titulo}</h2>
      <BasisSummary base={base} estado={estado} />
      <button
        type="button"
        className={estilos.chip}
        aria-expanded={abierta}
        aria-controls={idDetalle}
        onClick={() => setAbierta(!abierta)}
      >
        {abierta ? ocultarDetalle : verDetalle}
      </button>
      <div id={idDetalle} hidden={!abierta}>
        {abierta && <BasisDetail base={base} />}
      </div>
    </section>
  );
}
