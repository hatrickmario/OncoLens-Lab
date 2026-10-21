'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { zLoginBody } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { iniciarSesion } from '../../lib/auth/iniciar-sesion';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

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

/** Enlaza el aviso de error con los campos (`aria-describedby`). */
const ID_ERROR = 'login-error';

type Estado = 'inactivo' | 'enviando' | 'errorCredenciales' | 'errorServicio';

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
    'aria-describedby': conError ? ID_ERROR : undefined,
  };
  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      action="/api/auth/login"
      onSubmit={enviar}
      noValidate
    >
      {conError && (
        <Alert id={ID_ERROR}>
          {estado === 'errorServicio' ? textos.errorServicio : textos.errorCredenciales}
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-correo">{textos.correo}</Label>
        <Input
          id="login-correo"
          name="email"
          type="email"
          autoComplete="username"
          required
          {...ayudaDelError}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-contrasena">{textos.contrasena}</Label>
        <Input
          id="login-contrasena"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          {...ayudaDelError}
        />
      </div>
      <Button type="submit" disabled={estado === 'enviando'}>
        {estado === 'enviando' ? textos.enviando : textos.enviar}
      </Button>
    </form>
  );
}
