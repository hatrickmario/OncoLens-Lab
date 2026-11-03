'use client';

import { useState } from 'react';
import { enviarRegistro, type ErrorDeRegistro, type RutaDeRegistro } from './cliente';

/**
 * Envío de un registro manual y su estado (enviando, error junto al campo). Con error no cambia nada y el formulario
 * sigue abierto; con éxito entrega lo creado al llamador, que recarga la vista de caso.
 */
export function useEnvioDeRegistro(
  pacienteId: string,
  ruta: RutaDeRegistro,
  alGuardar: (creado: unknown) => void,
) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorDeRegistro | null>(null);

  async function enviar(cuerpo: unknown): Promise<void> {
    setEnviando(true);
    setError(null);
    const resultado = await enviarRegistro(pacienteId, ruta, cuerpo);
    setEnviando(false);
    if (resultado.tipo === 'error') setError(resultado.error);
    else alGuardar(resultado.creado);
  }

  return { enviando, error, enviar, fallar: setError };
}
