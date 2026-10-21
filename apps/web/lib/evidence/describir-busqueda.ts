import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';

type FuentesConsultadas = AnalysisBasis['sourcesConsulted'];

function nombrarFiltros(filtros: FuentesConsultadas['filters']): string {
  const { filtros: textos, ninguno } = mensajes().evidence.base;
  const activos = [
    filtros.historiaCompleta && textos.historiaCompleta,
    filtros.soloBiomarcadoresRelevantes && textos.soloBiomarcadoresRelevantes,
    filtros.ultimosSeisMeses && textos.ultimosSeisMeses,
    filtros.antecedentesFamiliares && textos.antecedentesFamiliares,
    filtros.publishedFromYear !== null &&
      rellenar(textos.publicadoDesde, { anio: filtros.publishedFromYear }),
  ].filter((texto): texto is string => typeof texto === 'string');
  return activos.join(', ') || ninguno;
}

export function nombrarFuentes(seleccionadas: FuentesConsultadas['selected']): string {
  const { fuentes } = mensajes().evidence.base;
  return seleccionadas.map((fuente) => fuentes[fuente]).join(', ');
}

/** "Qué se buscó…" del resumen; con `tipo_no_habilitado` dice que no se consultó el corpus (RN-20). */
export function describirBusqueda(
  consultadas: FuentesConsultadas,
  estado: 'con_evidencia' | 'sin_evidencia' | 'tipo_no_habilitado',
): string | null {
  const { busqueda, sinConsulta } = mensajes().evidence.base;
  if (estado === 'con_evidencia') return null;
  if (estado === 'tipo_no_habilitado') return sinConsulta;
  return rellenar(busqueda, {
    fuentes: nombrarFuentes(consultadas.selected),
    filtros: nombrarFiltros(consultadas.filters),
    n: consultadas.aboveThreshold,
  });
}
