'use client';

import { useEffect } from 'react';
import { anclaPermitida } from '../../lib/ficha/anclas';

/**
 * Da el foco al encabezado de la sección que nombra el fragmento de la URL, al montar y en `hashchange` (la
 * navegación de Next no garantiza el foco). Solo las anclas de la lista permitida, resueltas con `getElementById`:
 * nunca un selector armado con `location.hash` en crudo (l1d-97, D4). Un fragmento ajeno se ignora sin error.
 */
export function FocoPorAncla() {
  useEffect(() => {
    const enfocar = () => {
      const ancla = anclaPermitida(window.location.hash);
      if (ancla) document.getElementById(ancla)?.focus();
    };
    enfocar();
    window.addEventListener('hashchange', enfocar);
    return () => window.removeEventListener('hashchange', enfocar);
  }, []);
  return null;
}
