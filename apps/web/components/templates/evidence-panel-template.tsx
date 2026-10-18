import type { ReactNode } from 'react';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

/** Layout de la página de análisis: título, barra "Paciente · ID" (8 caracteres del UUID) y el panel. */
export function EvidencePanelTemplate({
  idPaciente,
  children,
}: {
  idPaciente: string;
  children: ReactNode;
}) {
  const { titulo, paciente } = mensajes().evidence;
  return (
    <main className={estilos.principal}>
      <h1>{titulo}</h1>
      <p className={estilos.barraPaciente}>
        {paciente} {idPaciente.slice(0, 8)}
      </p>
      {children}
    </main>
  );
}
