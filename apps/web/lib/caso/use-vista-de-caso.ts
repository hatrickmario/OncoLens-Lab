'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RUTA_LOGIN_EXPIRADA } from '../sesion/motivo-de-sesion';
import { leerVistaDeCaso, type LecturaDeCaso } from './leer-vista-de-caso';

/**
 * Vista de caso del paciente: se lee al montar y de nuevo con `recargar()` (el «Reintentar» y, después, los diálogos de
 * registro, `l1d-80`/`l1d-96`). `null` mientras no hay primera lectura. Una sesión vencida lleva al login con aviso.
 */
export function useVistaDeCaso(patientId: string) {
  const router = useRouter();
  const [lectura, setLectura] = useState<LecturaDeCaso | null>(null);

  const recargar = useCallback(async () => {
    setLectura(await leerVistaDeCaso(patientId));
  }, [patientId]);

  useEffect(() => {
    let vigente = true;
    void leerVistaDeCaso(patientId).then((nueva) => {
      if (vigente) setLectura(nueva);
    });
    return () => {
      vigente = false;
    };
  }, [patientId]);

  const sesionVencida = lectura?.tipo === 'sin_sesion';
  useEffect(() => {
    if (sesionVencida) router.replace(RUTA_LOGIN_EXPIRADA);
  }, [sesionVencida, router]);

  return { lectura, recargar };
}
