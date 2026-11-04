'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RUTA_LOGIN_EXPIRADA } from '../sesion/motivo-de-sesion';
import { enviarRegistro, type ErrorDeRegistro, type RutaDeRegistro } from './cliente';

/**
 * Envío de un registro manual y su estado (enviando, error junto al campo). Con error no cambia nada y el formulario
 * sigue abierto; con éxito entrega lo creado al llamador, que recarga la vista de caso; una sesión vencida lleva al
 * login con aviso.
 */
export function useEnvioDeRegistro(
  pacienteId: string,
  ruta: RutaDeRegistro,
  alGuardar: (creado: unknown) => void,
) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorDeRegistro | null>(null);

  async function enviar(cuerpo: unknown): Promise<void> {
    setEnviando(true);
    setError(null);
    const resultado = await enviarRegistro(pacienteId, ruta, cuerpo);
    setEnviando(false);
    if (resultado.tipo === 'sin_sesion') router.replace(RUTA_LOGIN_EXPIRADA);
    else if (resultado.tipo === 'error') setError(resultado.error);
    else alGuardar(resultado.creado);
  }

  return { enviando, error, enviar, fallar: setError };
}
