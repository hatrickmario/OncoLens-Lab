'use client';

import { useEffect, useState } from 'react';
import { pedirAtributosPermitidos, type LecturaDePermitidos } from './cliente';

/** Atributos del catálogo para el tipo de cáncer del paciente (RN-29); `null` mientras se leen. */
export function useAtributosPermitidos(pacienteId: string): LecturaDePermitidos | null {
  const [lectura, setLectura] = useState<LecturaDePermitidos | null>(null);
  useEffect(() => {
    let vigente = true;
    void pedirAtributosPermitidos(pacienteId).then((nueva) => {
      if (vigente) setLectura(nueva);
    });
    return () => {
      vigente = false;
    };
  }, [pacienteId]);
  return lectura;
}
