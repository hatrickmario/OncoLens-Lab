'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { zLoginBody } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import estilos from './login-form.module.css';

export interface TextosLogin {
  correo: string;
  contrasena: string;
  enviar: string;
  enviando: string;
  errorCredenciales: string;
}

export interface LoginFormProps {
  /** Ruta interna de inicio (WEB_HOME_PATH), validada en el servidor. */
  homePath: string;
  textos: TextosLogin;
}

type Estado = 'inactivo' | 'enviando' | 'error';

/** Un `204` es la única señal de sesión iniciada; cualquier otro resultado se trata como fallo genérico. */
async function iniciarSesion(credenciales: unknown): Promise<boolean> {
  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credenciales),
    });
    return respuesta.status === 204;
  } catch {
    return false;
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
      setEstado('error');
      return;
    }
    setEstado('enviando');
    if (await iniciarSesion(credenciales.data)) {
      router.replace(homePath);
    } else {
      setEstado('error');
    }
  }

  const conError = estado === 'error';
  return (
    <form className={estilos.formulario} onSubmit={enviar} noValidate>
      {conError && (
        <p role="alert" id="login-error" className={estilos.error}>
          {textos.errorCredenciales}
        </p>
      )}
      <label className={estilos.etiqueta}>
        {textos.correo}
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={conError}
          aria-describedby={conError ? 'login-error' : undefined}
          className={estilos.campo}
        />
      </label>
      <label className={estilos.etiqueta}>
        {textos.contrasena}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={conError}
          aria-describedby={conError ? 'login-error' : undefined}
          className={estilos.campo}
        />
      </label>
      <button type="submit" disabled={estado === 'enviando'} className={estilos.boton}>
        {estado === 'enviando' ? textos.enviando : textos.enviar}
      </button>
    </form>
  );
}
