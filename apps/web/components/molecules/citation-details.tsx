import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { esUrlHttpSegura, valorONoDisponible } from '../../lib/evidence/procedencia';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

/** Autores: la hoja se marca como corpus solo cuando hay valor; "No disponible" es texto de la UI (RN-25). */
export function AutoresDeLaCita({ autores }: { autores: string | null }) {
  return autores ? (
    <span data-origen="corpus" data-campo="authors">
      {autores}
    </span>
  ) : (
    valorONoDisponible(autores)
  );
}

/** Enlace a la fuente original solo si la URL es segura; si no, "No disponible" (RN-25). Lo comparten la cita y el fragmento. */
export function EnlaceFuenteOriginal({ url }: { url: string | null | undefined }) {
  return esUrlHttpSegura(url) ? (
    <a className={estilos.enlace} href={url ?? undefined} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  ) : (
    valorONoDisponible(null)
  );
}

export interface CitationDetailsProps {
  cita: CitedSource;
  id: string;
  onVerFragmento: () => void;
}

/** Metadatos de la cita con "No disponible" para lo ausente (RN-25) y enlace solo si es seguro. */
export function CitationDetails({ cita, id, onVerFragmento }: CitationDetailsProps) {
  const { cita: textos, licencia } = mensajes().evidence;
  return (
    <div id={id}>
      <p lang={cita.language}>
        <span data-origen="corpus" data-campo="title">
          {cita.title}
        </span>
      </p>
      <dl className={estilos.detalle}>
        <dt>{textos.autores}</dt>
        <dd>
          <AutoresDeLaCita autores={cita.authors} />
        </dd>
        <dt>{textos.diseno}</dt>
        <dd>{valorONoDisponible(cita.studyDesign)}</dd>
        <dt>{textos.publicado}</dt>
        <dd>{valorONoDisponible(cita.publishedAt)}</dd>
        <dt>{textos.actualizado}</dt>
        <dd>{valorONoDisponible(cita.lastUpdatedAt)}</dd>
        <dt>{textos.idioma}</dt>
        <dd>{cita.language}</dd>
        <dt>{textos.licencia}</dt>
        <dd>{licencia[cita.licenseClass]}</dd>
        <dt>{textos.fuenteOriginal}</dt>
        <dd>
          <EnlaceFuenteOriginal url={cita.sourceUrl} />
        </dd>
      </dl>
      <button type="button" className={estilos.chip} onClick={onVerFragmento}>
        {textos.verFragmento}
      </button>
    </div>
  );
}
