'use client';

export interface EvidencePanelProps {
  /** UUID del paciente de la ruta; va en el cuerpo de la petición, nunca en la URL de la petición. */
  patientId: string;
}

export function EvidencePanel(_props: EvidencePanelProps): never {
  throw new Error('no implementado');
}
