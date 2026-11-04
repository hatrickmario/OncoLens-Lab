'use client';

import { useEffect, useState } from 'react';
import { pedirValoresDelCatalogo, type LecturaDelCatalogo } from './valores-del-catalogo';

/**
 * Opciones del catálogo para los formularios de registro manual. Se leen cuando `activo` pasa a verdadero (diálogo
 * abierto o `?item=` presente), de nuevo en cada apertura: tras corregir el diagnóstico cambia el tipo de cáncer.
 * `null` mientras se leen.
 */
export function useValoresDelCatalogo(
  pacienteId: string,
  activo: boolean,
): LecturaDelCatalogo | null {
  const [lectura, setLectura] = useState<LecturaDelCatalogo | null>(null);
  useEffect(() => {
    if (!activo) {
      setLectura(null);
      return;
    }
    let vigente = true;
    void pedirValoresDelCatalogo(pacienteId).then((nueva) => {
      if (vigente) setLectura(nueva);
    });
    return () => {
      vigente = false;
    };
  }, [pacienteId, activo]);
  return lectura;
}
