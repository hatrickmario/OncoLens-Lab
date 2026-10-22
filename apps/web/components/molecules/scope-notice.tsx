import { mensajes } from '../../lib/mensajes';
import estilos from './scope-notice.module.css';

/** Aviso informativo de alcance (US-043, D2 de l1d-173): no es un error ni bloquea (RN-26). */
export function ScopeNotice() {
  return (
    <p role="status" className={estilos.aviso}>
      {mensajes().alcance.tipoNoHabilitado}
    </p>
  );
}
