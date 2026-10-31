'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RUTA_LOGIN_EXPIRADA } from '../sesion/motivo-de-sesion';
import type { LecturaDelChecklist } from './faltantes';
import { leerChecklist } from './leer-checklist';

/**
 * Checklist de datos críticos del paciente: se lee al montar y de nuevo cuando el panel lo pide (antes de cada
 * análisis, FR-23). `null` mientras no hay primera lectura. El aviso es informativo; el servidor recalcula (D1).
 * Una sesión vencida lleva al login con el aviso de sesión expirada, como el resto del panel.
 */
export function useChecklistDeFaltantes(patientId: string) {
  const router = useRouter();
  const [lectura, setLectura] = useState<LecturaDelChecklist | null>(null);

  const releer = useCallback(async () => {
    const nueva = await leerChecklist(patientId);
    setLectura(nueva);
    return nueva;
  }, [patientId]);

  useEffect(() => {
    let vigente = true;
    void leerChecklist(patientId).then((nueva) => {
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

  return { lectura, releer };
}
