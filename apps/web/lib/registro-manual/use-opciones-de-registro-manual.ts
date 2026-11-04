'use client';

import { useEffect, useState } from 'react';
import { pedirOpcionesDeRegistro, type LecturaDeOpciones } from './opciones';

/**
 * Opciones del catálogo para los formularios de registro manual. Se leen cuando `activo` pasa a verdadero (diálogo
 * abierto o `?item=` presente), de nuevo en cada apertura: tras corregir el diagnóstico cambia el tipo de cáncer.
 * `null` mientras se leen.
 */
export function useOpcionesDeRegistroManual(
  pacienteId: string,
  activo: boolean,
): LecturaDeOpciones | null {
  const [lectura, setLectura] = useState<LecturaDeOpciones | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    void pedirOpcionesDeRegistro(pacienteId).then((nueva) => {
      if (vigente) setLectura(nueva);
    });
    return () => {
      vigente = false;
    };
  }, [pacienteId, activo]);
  return lectura;
}
