import type { InputHTMLAttributes } from 'react';
import estilos from './campo-con-etiqueta.module.css';

interface CampoConEtiquetaProps extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
}

/** Etiqueta visible + campo de texto; el foco usa el contorno del sistema de diseño. */
export function CampoConEtiqueta({ etiqueta, ...atributos }: CampoConEtiquetaProps) {
  return (
    <label className={estilos.etiqueta}>
      {etiqueta}
      <input {...atributos} className={estilos.campo} />
    </label>
  );
}
