'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type {
  CitedSource,
  EvidenceAnalysisRequest,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { anunciarEstado } from '../../lib/evidence/anuncio-de-estado';
import { faseTrasSolicitud, type FaseDelPanel } from '../../lib/evidence/fase-del-panel';
import { armarSolicitud, solicitarAnalisis } from '../../lib/evidence/solicitar-analisis';
import estilos from '../evidence.module.css';
import { AnalysisFailure } from '../molecules/analysis-failure';
import { CitedFragment } from '../molecules/cited-fragment';
import { mensajes } from '../../lib/mensajes';
import { AnalysisResult } from './analysis-result';
import { EvidenceQueryForm } from './evidence-query-form';

export interface EvidencePanelProps {
  /** UUID del paciente de la ruta; va en el cuerpo de la petición, nunca en query strings. */
  patientId: string;
}

interface FragmentoAbierto {
  cita: CitedSource;
  idChip: string;
}

/** Única frontera `'use client'` del panel: pregunta, petición en curso, resultado o fallo y fragmento abierto. */
export function EvidencePanel({ patientId }: EvidencePanelProps) {
  const router = useRouter();
  const botonRef = useRef<HTMLButtonElement>(null);
  const [pregunta, setPregunta] = useState('');
  const [fase, setFase] = useState<FaseDelPanel>({ tipo: 'inactivo' });
  const [ultima, setUltima] = useState<EvidenceAnalysisRequest | null>(null);
  const [fragmento, setFragmento] = useState<FragmentoAbierto | null>(null);

  async function enviar(solicitud: EvidenceAnalysisRequest) {
    setUltima(solicitud);
    setFragmento(null);
    setFase({ tipo: 'enviando' });
    const resultado = await solicitarAnalisis(solicitud);
    if (resultado.tipo === 'sin_sesion') return router.replace('/login');
    setFase(faseTrasSolicitud(resultado));
  }

  function reintentar() {
    botonRef.current?.focus();
    if (ultima) void enviar(ultima);
  }

  function volverALaCita() {
    const idChip = fragmento?.idChip;
    setFragmento(null);
    if (idChip) document.getElementById(idChip)?.focus();
  }

  const { fragmento: textos } = mensajes().evidence;
  return (
    <div className={estilos.columnas}>
      <div className={estilos.columna}>
        <EvidenceQueryForm
          pregunta={pregunta}
          enviando={fase.tipo === 'enviando'}
          anuncio={anunciarEstado(fase)}
          botonRef={botonRef}
          onCambiar={setPregunta}
          onEnviar={() => pregunta.trim() && void enviar(armarSolicitud(patientId, pregunta))}
        />
        {fase.tipo === 'ok' && (
          <AnalysisResult
            analisis={fase.analisis}
            onVerFragmento={(cita, idChip) => setFragmento({ cita, idChip })}
          />
        )}
        {(fase.tipo === 'error' || fase.tipo === 'no_realizado') && (
          <AnalysisFailure fallo={fase} onReintentar={reintentar} />
        )}
      </div>
      <aside className={estilos.panelLateral} aria-label={textos.titulo}>
        {fragmento ? (
          <CitedFragment cita={fragmento.cita} onVolver={volverALaCita} />
        ) : (
          <p>{textos.ayuda}</p>
        )}
      </aside>
    </div>
  );
}
