import type { Mensajes } from '../../lib/mensajes';
import { claveDeAvisoDeSesion } from '../../lib/sesion/motivo-de-sesion';
import { cn } from '../../lib/utils';

export interface AvisoDeSesionProps {
  /** Valor crudo de `?motivo=`: solo `expirada` y `cerrada` producen aviso; el valor nunca se pinta. */
  motivo: string | string[] | undefined;
  textos: Pick<Mensajes['login'], 'sesionExpirada' | 'sesionCerrada'>;
  className?: string;
}

/** Aviso informativo (no es un error) de por qué el médico llegó a `/login` (S2-01). */
export function AvisoDeSesion({ motivo, textos, className }: AvisoDeSesionProps) {
  const clave = claveDeAvisoDeSesion(motivo);
  if (clave === null) return null;
  return (
    <p
      role="status"
      className={cn('rounded-control border-border bg-surface-alt text-text border p-3', className)}
    >
      {textos[clave]}
    </p>
  );
}
