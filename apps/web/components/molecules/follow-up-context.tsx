import { mensajes } from '../../lib/mensajes';
import { Card } from '../ui/card';

/** Recuadro fijo de S5-04: aclara que los hallazgos del análisis son contexto, no evidencia. */
export function FollowUpContext() {
  const { contextoTitulo, contextoTexto } = mensajes().followUp;
  return (
    <Card>
      <p className="m-0 font-semibold">{contextoTitulo}</p>
      <p className="m-0">{contextoTexto}</p>
    </Card>
  );
}
