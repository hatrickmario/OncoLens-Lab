import estilos from './ai-disclaimer.module.css';

/** Aviso de IA (RN-19): muestra tal cual el `disclaimer` de la respuesta, sin texto propio. */
export function AiDisclaimer({ text }: { text: string }) {
  return (
    <p role="note" className={estilos.aviso}>
      {text}
    </p>
  );
}
