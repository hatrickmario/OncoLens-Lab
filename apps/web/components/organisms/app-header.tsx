import { mensajes } from '../../lib/mensajes';
import estilos from './app-header.module.css';

/** Cabecera de toda página autenticada: marca y etiqueta permanente de uso académico (RN-19). */
export function AppHeader() {
  const { app } = mensajes();
  return (
    <header className={estilos.cabecera}>
      <span className={estilos.marca}>{app.nombre}</span>
      <span className={estilos.etiqueta}>{app.academicUseLabel}</span>
    </header>
  );
}
