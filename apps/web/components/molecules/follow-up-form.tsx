import type { FormEvent } from 'react';
import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export interface FollowUpFormProps {
  valor: string;
  enviando: boolean;
  /** Tras el límite no caben más preguntas: campo y botón deshabilitados. */
  deshabilitado: boolean;
  /** Mensaje de la pregunta no procesable, junto al campo. */
  error: string | null;
  onCambiar: (valor: string) => void;
  onEnviar: () => void;
}

/** Campo de pregunta con `<label>` visible; Enter o «Preguntar» envían (S5-04, AC-5). */
export function FollowUpForm(props: FollowUpFormProps) {
  const { valor, enviando, deshabilitado, error, onCambiar, onEnviar } = props;
  const { campo, preguntar, preguntando } = mensajes().followUp;
  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    onEnviar();
  }
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-2">
      <Label htmlFor="pregunta-seguimiento">{campo}</Label>
      <Input
        id="pregunta-seguimiento"
        value={valor}
        disabled={deshabilitado}
        aria-invalid={error !== null}
        aria-describedby={error ? 'pregunta-seguimiento-error' : undefined}
        onChange={(evento) => onCambiar(evento.target.value)}
      />
      {error && (
        <p id="pregunta-seguimiento-error" role="alert" className="text-error m-0">
          {error}
        </p>
      )}
      <Button type="submit" disabled={enviando || deshabilitado} className="self-start">
        {enviando ? preguntando : preguntar}
      </Button>
    </form>
  );
}
