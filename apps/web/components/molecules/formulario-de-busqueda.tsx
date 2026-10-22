'use client';

import { useState, type FormEvent } from 'react';
import { zSearchPatientsBody } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import type { CriterioDeBusqueda } from '../../lib/pacientes/buscar-pacientes';
import type { TextosDePacientes } from '../../lib/pacientes/consulta';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { PestanasDeBusqueda, type ModoDeBusqueda } from './pestanas-de-busqueda';
import { CamposDeBusqueda } from './campos-de-busqueda';

export interface FormularioDeBusquedaProps {
  textos: TextosDePacientes;
  buscando: boolean;
  onBuscar: (criterio: CriterioDeBusqueda) => void;
}

function criterioDe(datos: FormData, modo: ModoDeBusqueda): unknown {
  const texto = (campo: string) => String(datos.get(campo) ?? '').trim();
  return modo === 'documento'
    ? { idType: texto('idType'), nationalId: texto('nationalId') }
    : { name: texto('name') };
}

/** Búsqueda por documento o por nombre completo; valida con el Zod del contrato antes de enviar (UX; el servidor revalida). */
export function FormularioDeBusqueda({ textos, buscando, onBuscar }: FormularioDeBusquedaProps) {
  const [modo, setModo] = useState<ModoDeBusqueda>('documento');
  const [invalido, setInvalido] = useState(false);
  const { busqueda } = textos;

  function cambiarModo(nuevo: ModoDeBusqueda) {
    setModo(nuevo);
    setInvalido(false);
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const criterio = criterioDe(new FormData(evento.currentTarget), modo);
    const valido = zSearchPatientsBody.safeParse(criterio).success;
    setInvalido(!valido);
    if (valido) onBuscar(criterio as CriterioDeBusqueda);
  }

  return (
    <form
      role="search"
      aria-label={busqueda.etiqueta}
      // Un envío antes de hidratar es un POST nativo (identidad en el cuerpo), nunca un GET con query (RN-10).
      method="post"
      action="/api/patients/search"
      onSubmit={enviar}
      noValidate
      className="mb-4"
    >
      <PestanasDeBusqueda modo={modo} onCambiar={cambiarModo} textos={busqueda} />
      <CamposDeBusqueda modo={modo} textos={textos} invalido={invalido} />
      {invalido && <Alert id="busqueda-invalida">{busqueda.invalido}</Alert>}
      <Button type="submit" disabled={buscando} className="mt-3">
        {buscando ? busqueda.buscando : busqueda.buscar}
      </Button>
    </form>
  );
}
