import { LoginForm } from '../../components/organisms/login-form';
import { mensajes } from '../../lib/mensajes';
import { leerConfigWeb } from '../../lib/server/config';
import estilos from './login.module.css';

export const metadata = { title: mensajes().login.titulo };

// Lee WEB_HOME_PATH al atender cada petición, no al compilar.
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const { app, login } = mensajes();
  return (
    <main className={estilos.pagina}>
      <section className={estilos.tarjeta} aria-labelledby="login-titulo">
        <p className={estilos.marca}>{app.nombre}</p>
        <p className={estilos.etiquetaDeUso}>{app.academicUseLabel}</p>
        <h1 id="login-titulo">{login.titulo}</h1>
        <p className={estilos.subtitulo}>{login.subtitulo}</p>
        <LoginForm homePath={leerConfigWeb().homePath} textos={login} />
      </section>
    </main>
  );
}
