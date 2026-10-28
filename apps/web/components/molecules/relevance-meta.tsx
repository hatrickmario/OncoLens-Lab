import { formatearRelevancia } from '../../lib/evidence/formatear-relevancia';
import { mensajes, textoDe } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

/** Relevancia de recuperación como metadato secundario (RN-03): después de las citas, sin barra ni porcentaje. */
export function RelevanceMeta({
  valor,
  idAyuda,
  basis,
}: {
  valor: number | null;
  idAyuda: string;
  /** Clave de la base de la relevancia (D6): la elige la respuesta, igual que el criterio de orden. */
  basis: string;
}) {
  const { relevance } = mensajes().evidence;
  return (
    <div data-estilo="secundario" className={estilos.secundario}>
      <p>
        <span data-testid="relevance-label">{relevance.label}</span>{' '}
        <strong data-testid="relevance-value" aria-describedby={idAyuda}>
          {formatearRelevancia(valor)}
        </strong>
      </p>
      <p data-testid="relevance-basis">{textoDe(basis)}</p>
      <p>{relevance.note}</p>
      <p id={idAyuda} data-testid="relevance-help">
        {relevance.help}
      </p>
    </div>
  );
}
