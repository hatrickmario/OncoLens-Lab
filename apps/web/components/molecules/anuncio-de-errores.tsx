import { mensajes, rellenar } from '../../lib/mensajes';

/**
 * Región `aria-live="polite"` con cuántos campos necesitan revisión: existe siempre, para que el lector de pantalla
 * anuncie el cambio al aparecer. El texto de cada error va junto a su campo.
 */
export function AnuncioDeErrores({ cantidad }: { cantidad: number }) {
  const { uno, varios } = mensajes().registroManual.anuncio;
  const texto = cantidad === 0 ? '' : cantidad === 1 ? uno : rellenar(varios, { cantidad });
  return (
    <p aria-live="polite" className="text-error m-0">
      {texto}
    </p>
  );
}
