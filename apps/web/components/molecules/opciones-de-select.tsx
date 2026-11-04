import { mensajes } from '../../lib/mensajes';

/** Lista de opciones de un valor del contrato con su rótulo de `messages`; `rotulos` vacío usa el valor mismo. */
export function OpcionesDeSelect({
  valores,
  rotulos = {},
}: {
  valores: readonly string[];
  rotulos?: Record<string, string>;
}) {
  const { elegir } = mensajes().registroManual;
  return (
    <>
      <option value="">{elegir}</option>
      {valores.map((v) => (
        <option key={v} value={v}>
          {rotulos[v] ?? v}
        </option>
      ))}
    </>
  );
}
