'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { rutaDeLaPagina, type PaginaDeRegistro } from './enlaces';
import { resolverItem, type ItemResuelto } from './resolver-item';
import { useOpcionesDeRegistroManual } from './use-opciones-de-registro-manual';

type Entidad = ItemResuelto['entidad'];

export interface AperturaDeRegistroManual {
  abierto: boolean;
  /** Abre desde el botón: al cerrar, el foco vuelve a él. */
  abrir: (disparador: HTMLElement | null) => void;
  /** Cierra; si lo abrió `?item=`, quita el parámetro de la URL y el foco va al encabezado de la sección. */
  cerrar: () => void;
  /** Elemento que recibe el foco al cerrar (lo lee el `Dialog`). */
  retornoDeFoco: RefObject<HTMLElement | null>;
  lectura: ReturnType<typeof useOpcionesDeRegistroManual>;
  /** Qué pidió `?item=` para esta entidad; `null` si no aplica a ella. */
  deLaUrl: ItemResuelto | null;
  /** Tras un `201`: refresca la ficha y la barra del paciente (RSC) sin recargar la página. */
  refrescar: () => void;
}

export interface ConfiguracionDeApertura {
  pacienteId: string;
  pagina: PaginaDeRegistro;
  entidad: Entidad;
  item: string | undefined;
  /** Id del encabezado de la sección, a donde vuelve el foco si abrió la URL. */
  idDelEncabezado: string;
}

/**
 * Apertura de un formulario de registro manual: por el botón o por `?item=<clave>` (D7). Las opciones se leen al abrir
 * o si hay `item`; la clave se resuelve con el catálogo y abre solo el formulario de su entidad, una vez por clave.
 */
export function useAperturaDeRegistroManual(
  config: ConfiguracionDeApertura,
): AperturaDeRegistroManual {
  const { pacienteId, pagina, entidad, item, idDelEncabezado } = config;
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const retornoDeFoco = useRef<HTMLElement | null>(null);
  const claveAbierta = useRef<string | undefined>(undefined);
  const lectura = useOpcionesDeRegistroManual(pacienteId, abierto || item !== undefined);

  const resuelto =
    item !== undefined && lectura?.tipo === 'ok' ? resolverItem(lectura.opciones, item) : null;
  const deLaUrl = resuelto?.entidad === entidad ? resuelto : null;

  useEffect(() => {
    if (item === undefined) claveAbierta.current = undefined;
    else if (deLaUrl !== null && claveAbierta.current !== item) {
      claveAbierta.current = item;
      retornoDeFoco.current = document.getElementById(idDelEncabezado);
      setAbierto(true);
    }
  }, [deLaUrl, item, idDelEncabezado]);

  return {
    abierto,
    abrir: (disparador) => {
      retornoDeFoco.current = disparador;
      setAbierto(true);
    },
    cerrar: () => {
      setAbierto(false);
      if (item !== undefined && claveAbierta.current === item) {
        router.replace(rutaDeLaPagina(pacienteId, pagina));
      }
    },
    retornoDeFoco,
    lectura,
    deLaUrl,
    refrescar: () => router.refresh(),
  };
}
