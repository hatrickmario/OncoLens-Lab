import { LoginForm } from '../../components/organisms/login-form';
import { Card } from '../../components/ui/card';
import { mensajes } from '../../lib/mensajes';
import { leerConfigWeb } from '../../lib/server/config';

export const metadata = { title: mensajes().login.titulo };

// Lee WEB_HOME_PATH al atender cada petición, no al compilar.
export const dynamic = 'force-dynamic';

export default async function LoginPage(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  } = {},
) {
  void props.searchParams; // esqueleto del AC-4: se consume en el feat
  const { app, login } = mensajes();
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <Card
        variante="elevada"
        role="region"
        aria-labelledby="login-titulo"
        className="w-full max-w-104 px-6 py-8"
      >
        <p className="text-chrome m-0 text-xl font-bold">{app.nombre}</p>
        <p className="rounded-etiqueta bg-chrome mt-2 mb-4 inline-block px-2 py-0.5 text-sm text-white">
          {app.academicUseLabel}
        </p>
        <h1 id="login-titulo" className="m-0 mb-2 text-2xl font-semibold">
          {login.titulo}
        </h1>
        <p className="text-text-muted m-0 mb-6">{login.subtitulo}</p>
        <LoginForm homePath={leerConfigWeb().homePath} textos={login} />
      </Card>
    </main>
  );
}
