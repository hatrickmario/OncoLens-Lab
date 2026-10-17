'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { zLoginBody } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { CampoConEtiqueta } from '../molecules/campo-con-etiqueta';
import estilos from './login-form.module.css';

export interface TextosLogin {
  correo: string;
  contrasena: string;
  enviar: string;
  enviando: string;
  errorCredenciales: string;
  errorServicio: string;
}

export interface LoginFormProps {
  /** Ruta interna de inicio (WEB_HOME_PATH), validada en el servidor. */
  homePath: string;
  textos: TextosLogin;
}

type Estado = 'inactivo' | 'enviando' | 'errorCredenciales' | 'errorServicio';

/**
 * `204` = sesión iniciada; `401` y `422` = credenciales (mismo aviso genérico, no revela cuál falló);
 * cualquier otra cosa (red, 429, 5xx) = aviso de servicio, para no culpar a la contraseña.
 */
async function iniciarSesion(
  credenciales: unknown,
): Promise<'iniciada' | 'errorCredenciales' | 'errorServicio'> {
  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credenciales),
    });
    if (respuesta.status === 204) return 'iniciada';
    return respuesta.status === 401 || respuesta.status === 422
      ? 'errorCredenciales'
      : 'errorServicio';
  } catch {
    return 'errorServicio';
  }
}

export function LoginForm({ homePath, textos }: LoginFormProps) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>('inactivo');

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const credenciales = zLoginBody.safeParse({
      email: datos.get('email'),
      password: datos.get('password'),
    });
    if (!credenciales.success) {
      setEstado('errorCredenciales');
      return;
    }
    setEstado('enviando');
    const resultado = await iniciarSesion(credenciales.data);
    if (resultado === 'iniciada') {
      router.replace(homePath);
    } else {
      setEstado(resultado);
    }
  }

  const conError = estado === 'errorCredenciales' || estado === 'errorServicio';
  const ayudaDelError = {
    'aria-invalid': conError,
    'aria-describedby': conError ? 'login-error' : undefined,
  };
  return (
    <form
      className={estilos.formulario}
      method="post"
      action="/api/auth/login"
      onSubmit={enviar}
      noValidate
    >
      {conError && (
        <p role="alert" id="login-error" className={estilos.error}>
          {estado === 'errorServicio' ? textos.errorServicio : textos.errorCredenciales}
        </p>
      )}
      <CampoConEtiqueta
        etiqueta={textos.correo}
        name="email"
        type="email"
        autoComplete="username"
        required
        {...ayudaDelError}
      />
      <CampoConEtiqueta
        etiqueta={textos.contrasena}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        {...ayudaDelError}
      />
      <button type="submit" disabled={estado === 'enviando'} className={estilos.boton}>
        {estado === 'enviando' ? textos.enviando : textos.enviar}
      </button>
    </form>
  );
}
