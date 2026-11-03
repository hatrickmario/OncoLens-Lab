'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { enviarCorreccion, type ErrorDeCorreccion } from './cliente';

/**
 * Envío de una corrección y su estado (enviando, error junto al campo), compartido por los formularios del biomarcador
 * y de la nota. Tras guardar revalida el RSC de la ficha (`router.refresh()`) y avisa al llamador; con error no cambia
 * nada y el formulario sigue abierto.
 */
export function useEnvioDeCorreccion(ruta: string, alGuardar: () => void) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorDeCorreccion | null>(null);

  async function enviar(cuerpo: unknown): Promise<void> {
    setEnviando(true);
    setError(null);
    const resultado = await enviarCorreccion(ruta, cuerpo);
    setEnviando(false);
    if (resultado.tipo === 'error') {
      setError(resultado.error);
      return;
    }
    router.refresh();
    alGuardar();
  }

  return { enviando, error, enviar, fallar: setError };
}
