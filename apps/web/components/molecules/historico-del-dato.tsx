'use client';

import { useId, useState } from 'react';
import type { CorrectionHistoryEntry } from '../../../../packages/api-contracts/src/types/clinical-api';
import { pedirHistorico, type ResultadoDeHistorico } from '../../lib/correcciones/cliente';
import { fechaRelativa } from '../../lib/ficha/fecha-relativa';
import { formatearFecha } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';

function textoDeLaVersion(version: CorrectionHistoryEntry): string {
  if (version.content !== undefined) return version.content;
  return [version.value, version.unit].filter(Boolean).join(' ');
}

function VersionAnterior({ version }: { version: CorrectionHistoryEntry }) {
  const { ficha } = mensajes();
  return (
    <li className="border-border flex flex-wrap items-baseline gap-x-2 border-b py-1 last:border-b-0">
      <span className="whitespace-pre-wrap">{textoDeLaVersion(version)}</span>
      <time dateTime={version.recordedAt} title={formatearFecha(version.recordedAt)}>
        {fechaRelativa(version.recordedAt, new Date())}
      </time>
      <span>{ficha.origen[version.entryMethod]}</span>
      <span className="text-text-muted">{ficha.correccion.historico.reemplazado}</span>
    </li>
  );
}

function ContenidoDelHistorico({ estado }: { estado: ResultadoDeHistorico | 'cargando' }) {
  const { historico } = mensajes().ficha.correccion;
  if (estado === 'cargando') return <p className="m-0">{historico.cargando}</p>;
  if (estado.tipo === 'error') return <p className="m-0">{historico.error}</p>;
  if (estado.versiones.length === 0) return <p className="m-0">{historico.vacio}</p>;
  return (
    <ul aria-label={historico.etiqueta} className="m-0 list-none p-0">
      {estado.versiones.map((version) => (
        <VersionAnterior key={version.id} version={version} />
      ))}
    </ul>
  );
}

/** «▸ Histórico» desplegable bajo un dato: pide las versiones reemplazadas al BFF al abrirse la primera vez (RN-08). */
export function HistoricoDelDato({ ruta }: { ruta: string }) {
  const idDelPanel = useId();
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<ResultadoDeHistorico | 'cargando' | null>(null);

  async function alternar() {
    setAbierto(!abierto);
    const yaCargado = estado !== null && estado !== 'cargando' && estado.tipo === 'ok';
    if (abierto || yaCargado) return;
    setEstado('cargando');
    setEstado(await pedirHistorico(ruta));
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idDelPanel}
        onClick={alternar}
        className="text-primary min-h-11 cursor-pointer bg-transparent font-semibold"
      >
        <span aria-hidden="true">{abierto ? '▾ ' : '▸ '}</span>
        {mensajes().ficha.correccion.historico.abrir}
      </button>
      <div id={idDelPanel} hidden={!abierto}>
        {abierto && estado !== null && <ContenidoDelHistorico estado={estado} />}
      </div>
    </div>
  );
}
