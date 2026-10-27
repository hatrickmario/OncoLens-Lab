'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type {
  CitedSource,
  EvidenceAnalysisRequest,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { anunciarEstado } from '../../lib/evidence/anuncio-de-estado';
import { esFallo, faseTrasSolicitud, type FaseDelPanel } from '../../lib/evidence/fase-del-panel';
import { puedeEnviar, validarPregunta } from '../../lib/evidence/reglas-del-formulario';
import { armarSolicitud, solicitarAnalisis } from '../../lib/evidence/solicitar-analisis';
import { EvidenceOptionSkeleton } from '../atoms/evidence-option-skeleton';
import estilos from '../evidence.module.css';
import { AnalysisFailure } from '../molecules/analysis-failure';
import { CitedFragment } from '../molecules/cited-fragment';
import { mensajes } from '../../lib/mensajes';
import { RUTA_LOGIN_EXPIRADA } from '../../lib/sesion/motivo-de-sesion';
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
  // Guarda síncrona: el estado de React no basta ante un doble clic antes del re-render (D1).
  const enCurso = useRef(false);
  const [pregunta, setPregunta] = useState('');
  const [fase, setFase] = useState<FaseDelPanel>({ tipo: 'inactivo' });
  const [ultima, setUltima] = useState<EvidenceAnalysisRequest | null>(null);
  const [fragmento, setFragmento] = useState<FragmentoAbierto | null>(null);

  async function enviar(solicitud: EvidenceAnalysisRequest) {
    if (!puedeEnviar(enCurso.current, solicitud.query)) return;
    enCurso.current = true;
    setUltima(solicitud);
    setFragmento(null);
    setFase({ tipo: 'enviando' });
    const resultado = await solicitarAnalisis(solicitud);
    enCurso.current = false;
    if (resultado.tipo === 'sin_sesion') return router.replace(RUTA_LOGIN_EXPIRADA);
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

  const validacion = validarPregunta(pregunta);
  const { fragmento: textos } = mensajes().evidence;
  return (
    <div className={estilos.columnas}>
      <div className={estilos.columna}>
        <EvidenceQueryForm
          pregunta={pregunta}
          enviando={fase.tipo === 'enviando'}
          errorMaximo={validacion.ok ? null : validacion.max}
          anuncio={anunciarEstado(fase)}
          botonRef={botonRef}
          onCambiar={setPregunta}
          onEnviar={() => validacion.ok && void enviar(armarSolicitud(patientId, pregunta))}
        />
        {fase.tipo === 'enviando' && <EvidenceOptionSkeleton />}
        {fase.tipo === 'ok' && (
          <AnalysisResult
            analisis={fase.analisis}
            onVerFragmento={(cita, idChip) => setFragmento({ cita, idChip })}
          />
        )}
        {esFallo(fase) && <AnalysisFailure fallo={fase} onReintentar={reintentar} />}
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
