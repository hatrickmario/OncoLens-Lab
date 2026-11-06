import type { ReactNode, Ref } from 'react';
import { AccionCorregirDato } from './accion-corregir-dato';
import { AccionDeRegistro } from './accion-de-registro';

export interface DisparadorDelDialogoProps {
  /** Texto de «+ Agregar…» del alta; se ignora al corregir. */
  texto: ReactNode;
  /** Nombre del dato que se corrige: con él el botón es «Corregir dato · {nombre}», propio de su fila. */
  correccion?: string;
  egresado: boolean;
  /** Id del texto de egresado que explica el botón deshabilitado (RN-17). */
  idDeAyuda: string;
  alAbrir: () => void;
  ref?: Ref<HTMLButtonElement>;
}

/** Botón que abre el diálogo de registro: «+ Agregar…» en el alta o «Corregir dato» por fila en la corrección. */
export function DisparadorDelDialogo({ correccion, texto, ...resto }: DisparadorDelDialogoProps) {
  return correccion === undefined ? (
    <AccionDeRegistro texto={texto} {...resto} />
  ) : (
    <AccionCorregirDato nombre={correccion} {...resto} />
  );
}
