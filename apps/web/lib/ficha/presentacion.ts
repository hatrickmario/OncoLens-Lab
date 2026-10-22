import type {
  DiagnosisGrading,
  Provenance,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';
import { textoDeRevision } from '../evidence/texto-de-revision';

/** `2026-09-01` → `01/09/2026` (fecha local del dato, sin pasar por `Date` para no desplazar el día). */
export function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Origen y revisión siempre en texto ("Carga inicial · Verificado"), nunca solo por color (WCAG, RN-07). */
export function textoDeOrigen(procedencia: Provenance): string {
  return `${mensajes().ficha.origen[procedencia.entryMethod]} · ${textoDeRevision(procedencia)}`;
}

function valorDeGradacion(g: DiagnosisGrading): string {
  if (g.gradingSystem === 'nottingham') return `Nottingham grado ${g.nottinghamGrade}`;
  return `Gleason ${g.gleasonPrimaryPattern}+${g.gleasonSecondaryPattern}=${g.gleasonScore} · ISUP ${g.isupGradeGroup}`;
}

/** Una gradación con su espécimen y alcance si los tiene ("Prostatectomía · Global: Gleason 4+3=7 · ISUP 3"). */
export function describirGradacion(g: DiagnosisGrading): string {
  const { especimen, alcance } = mensajes().ficha;
  const contexto = [
    g.specimenType && especimen[g.specimenType],
    g.gradeScope && alcance[g.gradeScope],
  ].filter(Boolean);
  const valor = valorDeGradacion(g);
  return contexto.length === 0 ? valor : `${contexto.join(' · ')}: ${valor}`;
}

/** Aviso informativo "[n] datos …" con singular y plural; `claveUno` y `claveN` son de `ficha.avisos`. */
export function textoDeAviso(n: number, claveUno: 'porRevisarUno' | 'sinVerificarUno'): string {
  const { avisos } = mensajes().ficha;
  const claveN = claveUno === 'porRevisarUno' ? 'porRevisarN' : 'sinVerificarN';
  return n === 1 ? avisos[claveUno] : rellenar(avisos[claveN], { n });
}
