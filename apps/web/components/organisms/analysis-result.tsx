'use client';

import type {
  CitedSource,
  EvidenceAnalysis,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { clasificarResultado } from '../../lib/evidence/clasificar-resultado';
import { formatearRelevancia } from '../../lib/evidence/formatear-relevancia';
import { mensajes } from '../../lib/mensajes';
import { AiDisclaimer } from '../molecules/ai-disclaimer';
import { ScopeNotice } from '../molecules/scope-notice';
import { AnalysisBasisPanel } from './analysis-basis-panel';
import { DiscardedOptions } from './discarded-options';
import { EvidenceOptionCard } from './evidence-option-card';
import { OrderingCriterion } from './ordering-criterion';

export interface AnalysisResultProps {
  analisis: EvidenceAnalysis;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/** Despacha el resultado ya validado y persistido por su clase (design D2); nunca se emite contenido sin validar. */
export function AnalysisResult({ analisis, onVerFragmento }: AnalysisResultProps) {
  const { resultado } = mensajes().evidence;
  const clase = clasificarResultado(analisis);
  const descartadas = analisis.discardedOptions;
  const descartadasAparte = clase === 'con_opciones' || clase === 'solo_descartadas';
  return (
    <div data-testid="analysis-result">
      <p>
        {analisis.queryText} · {resultado.idioma} {analisis.queryLanguage}
      </p>
      <AiDisclaimer text={analisis.disclaimer} />
      {clase === 'con_opciones' && (
        <>
          <h2>{resultado.encabezado}</h2>
          <OrderingCriterion analisis={analisis} />
          {analisis.evidenceOptions.map((opcion, indice) => (
            <EvidenceOptionCard
              key={opcion.option}
              opcion={opcion}
              indice={indice}
              onVerFragmento={onVerFragmento}
            />
          ))}
        </>
      )}
      {clase === 'solo_descartadas' && <p>{resultado.soloDescartadas}</p>}
      {clase === 'sin_opciones' && <p>{resultado.sinOpciones}</p>}
      {clase === 'sin_evidencia' && (
        <>
          <p>{resultado.sinEvidencia}</p>
          <p>
            {resultado.relevanciaMaxima}: {formatearRelevancia(analisis.topRelevanceScore)}
          </p>
        </>
      )}
      {clase === 'tipo_no_habilitado' && <ScopeNotice />}
      {descartadasAparte && descartadas.length > 0 && (
        <DiscardedOptions
          descartadas={descartadas}
          idAnalisis={analisis.id}
          creadoEn={analisis.createdAt}
        />
      )}
      <AnalysisBasisPanel base={analisis.analysisBasis} estado={analisis.status} />
      <AiDisclaimer text={analisis.disclaimer} />
    </div>
  );
}
