import estilos from '../evidence.module.css';

/** Esqueleto de la tarjeta mientras el análisis está en curso: decorativo y sin texto con forma de opción. */
export function EvidenceOptionSkeleton() {
  return (
    <div data-testid="option-skeleton" className={estilos.esqueleto} aria-hidden="true">
      <span className={estilos.esqueletoLinea} />
      <span className={estilos.esqueletoLinea} />
      <span className={estilos.esqueletoLinea} />
    </div>
  );
}
