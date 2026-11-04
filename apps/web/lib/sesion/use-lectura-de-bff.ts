'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RUTA_LOGIN_EXPIRADA } from './motivo-de-sesion';

/**
 * Lectura de un `GET /api/*` de web por paciente: se lee al montar y de nuevo con `recargar()`, que devuelve la lectura
 * nueva. `null` mientras no hay primera lectura. Una sesión vencida (`tipo: 'sin_sesion'`) lleva al login con el aviso
 * de sesión expirada, por cualquiera de los dos caminos: es el único dueño de esa redirección en las lecturas del caso.
 */
export function useLecturaDeBff<L extends { tipo: string }>(
  leer: (patientId: string) => Promise<L>,
  patientId: string,
) {
  const router = useRouter();
  const [lectura, setLectura] = useState<L | null>(null);

  const recargar = useCallback(async () => {
    const nueva = await leer(patientId);
    setLectura(nueva);
    return nueva;
  }, [leer, patientId]);

  useEffect(() => {
    let vigente = true;
    void leer(patientId).then((nueva) => {
      if (vigente) setLectura(nueva);
    });
    return () => {
      vigente = false;
    };
  }, [leer, patientId]);

  const sesionVencida = lectura?.tipo === 'sin_sesion';
  useEffect(() => {
    if (sesionVencida) router.replace(RUTA_LOGIN_EXPIRADA);
  }, [sesionVencida, router]);

  return { lectura, recargar };
}
