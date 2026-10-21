import { mensajes } from '../../lib/mensajes';
import { BotonCerrarSesion } from '../molecules/boton-cerrar-sesion';
import estilos from './app-header.module.css';

/** Cabecera de toda página autenticada: marca, etiqueta permanente de uso académico (RN-19) y cierre de sesión. */
export function AppHeader() {
  const { app } = mensajes();
  return (
    <header className={estilos.cabecera}>
      <span className={estilos.marca}>{app.nombre}</span>
      <span className={estilos.etiqueta}>{app.academicUseLabel}</span>
      <div className={estilos.usuario}>
        <BotonCerrarSesion textos={app} />
      </div>
    </header>
  );
}
