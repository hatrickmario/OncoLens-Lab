'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { cerrarSesion } from '../../lib/auth/cerrar-sesion';
import { RUTA_LOGIN_CERRADA, RUTA_LOGIN_EXPIRADA } from '../../lib/sesion/motivo-de-sesion';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';

export interface BotonCerrarSesionProps {
  textos: { cerrarSesion: string; errorCerrarSesion: string };
}

/** Formulario `POST /api/auth/logout` (sin JS cae al envío nativo; con JS lleva a `/login?motivo=…`). */
export function BotonCerrarSesion({ textos }: BotonCerrarSesionProps) {
  const router = useRouter();
  const [estado, setEstado] = useState<'inactivo' | 'cerrando' | 'fallo'>('inactivo');

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEstado('cerrando');
    const resultado = await cerrarSesion();
    if (resultado === 'fallo') {
      setEstado('fallo');
    } else {
      router.replace(resultado === 'cerrada' ? RUTA_LOGIN_CERRADA : RUTA_LOGIN_EXPIRADA);
    }
  }

  return (
    <form
      method="post"
      action="/api/auth/logout"
      onSubmit={enviar}
      className="flex items-center gap-2"
    >
      {estado === 'fallo' && <Alert>{textos.errorCerrarSesion}</Alert>}
      <Button type="submit" variante="secundario" disabled={estado === 'cerrando'}>
        {textos.cerrarSesion}
      </Button>
    </form>
  );
}
