import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { nombrarFuentes } from '../../lib/evidence/describir-busqueda';
import { mensajes } from '../../lib/mensajes';

/** "Qué se buscó" cuando no hubo evidencia (S3-01): la pregunta, su idioma y las fuentes consultadas. */
export function QueSeBusco({
  analisis,
}: {
  analisis: Pick<EvidenceAnalysis, 'queryText' | 'queryLanguage' | 'analysisBasis'>;
}) {
  const { resultado } = mensajes().evidence;
  const fuentes = nombrarFuentes(analisis.analysisBasis.sourcesConsulted.selected);
  return (
    <section aria-label={resultado.queSeBusco}>
      <p>{analisis.queryText}</p>
      <p>
        {resultado.idioma} {analisis.queryLanguage}
      </p>
      <p>
        {resultado.fuentes}: {fuentes}
      </p>
    </section>
  );
}
