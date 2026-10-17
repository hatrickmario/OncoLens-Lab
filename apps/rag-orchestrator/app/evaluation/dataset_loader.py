"""Carga y validación del mini-dataset sintético de ADR-39 (US-012 AC-9, AC-13).

Lee solo archivos de ``data/eval/adr39-mini/``: ningún acceso a bases de datos ni a datos clínicos.
Un manifiesto sin ``clase: sintetico``, con una fuente sin licencia aceptada o con una fuente
excluida (NCCN, ESMO; RN-21) se rechaza con ``DatasetInvalido`` antes de medir nada (RN-13, RN-14).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from app.config.settings import Settings

CLASE_SINTETICA = "sintetico"
ETIQUETAS_NLI = ("entailment", "neutral", "contradiction")
MODOS_ACIERTO = ("cualquiera", "cobertura_documentos", "sin_evidencia")

# Licencias de fuente del corpus aceptadas por ADR-36 (RN-21). NCI y ClinicalTrials.gov se aceptan por sus
# términos de reutilización verificados, no por clase de licencia (tarea 1.2).
CLASE_NCI = re.compile(r"^Texto de NCI libre de copyright(?=$| \()")
# Coincidencia exacta de la clase (con versión) seguida del fin o de una aclaración entre paréntesis.
CLASE_LICENCIA_ACEPTADA = re.compile(r"^(?:CC0 \d\.\d|CC BY(?:-SA)? \d\.\d)(?=$| \()")
# CC BY-NC solo en el MVP académico (RN-21), con bandera explícita.
CLASE_LICENCIA_NC = re.compile(r"^CC BY-NC \d\.\d(?=$| \()")
CONTIENE_ND = re.compile(r"(?<![A-Za-z])ND(?![A-Za-z])", re.IGNORECASE)
TERMINOS_VERIFICADOS_ACEPTADOS = ("terminos_NLM_ClinicalTrials_gov",)
FUENTES_EXCLUIDAS_SIEMPRE = ("NCCN", "ESMO")

MINIMO_PREGUNTAS = 30
MINIMO_PREGUNTAS_ES = 10
MINIMO_PARES_NLI = 30


class DatasetInvalido(ValueError):
    """El dataset incumple tamaño, idioma, clase o licencia; la medición no debe empezar."""


@dataclass(frozen=True)
class Evidencia:
    documento: str
    cita: str


@dataclass(frozen=True)
class Pregunta:
    id: str
    idioma: str
    cancer: str
    tipo: str
    texto: str
    modo_acierto: str
    documentos: tuple[str, ...]
    evidencia: tuple[Evidencia, ...]
    control_de: str | None = None
    alias: str | None = None

    @property
    def es_espanol_contra_ingles(self) -> bool:
        return self.idioma == "es" and self.modo_acierto != "sin_evidencia"

    @property
    def es_control_ingles(self) -> bool:
        return self.idioma == "en" and self.control_de is not None


@dataclass(frozen=True)
class ParNli:
    id: str
    etiqueta: str
    fragmento: str
    afirmacion: str
    idioma_afirmacion: str
    idioma_fragmento: str
    variante_otro_idioma: str | None = None


@dataclass(frozen=True)
class Fuente:
    id: str
    nombre: str
    tipo: str
    formato_original: str
    datos: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Dataset:
    nombre: str
    version: str
    fuentes: tuple[Fuente, ...]
    preguntas: tuple[Pregunta, ...]
    pares_nli: tuple[ParNli, ...]

    def fuente(self, id_fuente: str) -> Fuente:
        for f in self.fuentes:
            if f.id == id_fuente:
                return f
        raise KeyError(id_fuente)


def _leer_yaml(ruta: Path) -> dict[str, Any]:
    try:
        contenido = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise DatasetInvalido(f"falta el archivo {ruta.name}") from exc
    if not isinstance(contenido, dict):
        raise DatasetInvalido(f"{ruta.name} no es un mapa YAML")
    return contenido


def _motivo_de_rechazo_de_licencia(fuente: dict[str, Any], permitir_cc_by_nc: bool) -> str | None:
    """Causa concreta por la que la licencia de la fuente no se acepta (RN-21); ``None`` si se acepta."""
    licencia = str(fuente.get("licencia") or "").strip()
    if not licencia:
        if _terminos_verificados_de_clinicaltrials(fuente):
            return None
        return "sin licencia aceptada (RN-21)"
    if CONTIENE_ND.search(licencia):
        return "licencia con cláusula ND no aceptada (RN-21)"
    if (
        CLASE_LICENCIA_ACEPTADA.match(licencia)
        or licencia == "Dominio público"
        or CLASE_NCI.match(licencia)
    ):
        return None
    if not CLASE_LICENCIA_NC.match(licencia):
        return "licencia fuera de las clases aceptadas (RN-21)"
    if not permitir_cc_by_nc:
        return "licencia CC BY-NC no aceptada: exige ALLOW_CC_BY_NC=true (RN-21)"
    if fuente.get("nc_solo_academico") is not True:
        return "licencia CC BY-NC no aceptada: exige 'nc_solo_academico: true' (RN-21)"
    return None


def _terminos_verificados_de_clinicaltrials(fuente: dict[str, Any]) -> bool:
    """Los términos de reutilización verificados solo sustituyen a la licencia en ClinicalTrials.gov (tarea 1.2)."""
    if fuente.get("licencia_verificada") not in TERMINOS_VERIFICADOS_ACEPTADOS:
        return False

    return _emisor_de_la_etiqueta(str(fuente.get("fuente", ""))) == "clinicaltrials.gov"


def _emisor_de_la_etiqueta(etiqueta: str) -> str:
    """Emisor de una etiqueta de fuente con formato "<emisor> / <identificador>", en minúsculas y sin espacios."""
    return etiqueta.split("/", 1)[0].strip().lower()


def _validar_manifiesto(
    manifiesto: dict[str, Any], permitir_cc_by_nc: bool = False
) -> tuple[Fuente, ...]:
    if manifiesto.get("clase") != CLASE_SINTETICA:
        raise DatasetInvalido("el manifiesto no declara 'clase: sintetico' (RN-13, RN-14)")
    excluidas = {str(x).upper() for x in manifiesto.get("excluded_sources", [])}
    fuentes: list[Fuente] = []
    for crudo in manifiesto.get("fuentes", []):
        nombre = str(crudo.get("fuente", ""))
        if any(nombre.upper().startswith(e) for e in (*FUENTES_EXCLUIDAS_SIEMPRE, *excluidas)):
            raise DatasetInvalido(f"la fuente {crudo.get('id')} ({nombre}) está excluida (RN-21)")
        motivo = _motivo_de_rechazo_de_licencia(crudo, permitir_cc_by_nc)
        if motivo is not None:
            raise DatasetInvalido(f"la fuente {crudo.get('id')}: {motivo}")
        fuentes.append(
            Fuente(
                id=str(crudo["id"]),
                nombre=nombre,
                tipo=str(crudo.get("tipo", "")),
                formato_original=str(crudo.get("formato_original", "")),
                datos={
                    k: v
                    for k, v in crudo.items()
                    if k not in {"id", "fuente", "tipo", "formato_original"}
                },
            )
        )
    if not fuentes:
        raise DatasetInvalido("el manifiesto no lista fuentes")
    return tuple(fuentes)


def _construir_pregunta(crudo: dict[str, Any], ids_fuentes: set[str]) -> Pregunta:
    modo = crudo.get("modo_acierto")
    if modo not in MODOS_ACIERTO:
        raise DatasetInvalido(f"{crudo.get('id')}: modo_acierto desconocido ({modo!r})")
    evidencia = tuple(
        Evidencia(str(e["documento"]), str(e["cita"])) for e in crudo.get("evidencia", [])
    )
    if modo != "sin_evidencia" and not evidencia:
        raise DatasetInvalido(
            f"{crudo['id']}: una pregunta con respuesta necesita documento y cita literal"
        )
    for ev in evidencia:
        if ev.documento not in ids_fuentes:
            raise DatasetInvalido(
                f"{crudo['id']}: el documento {ev.documento} no está en el manifiesto"
            )
        if not ev.cita.strip():
            raise DatasetInvalido(f"{crudo['id']}: cita vacía para {ev.documento}")
    return Pregunta(
        id=str(crudo["id"]),
        idioma=str(crudo["idioma"]),
        cancer=str(crudo.get("cancer", "")),
        tipo=str(crudo.get("tipo", "")),
        texto=str(crudo["pregunta"]),
        modo_acierto=modo,
        documentos=tuple(str(d) for d in crudo.get("documentos", [])),
        evidencia=evidencia,
        control_de=crudo.get("control_de"),
        alias=crudo.get("alias"),
    )


def _construir_par(crudo: dict[str, Any]) -> ParNli:
    if crudo.get("etiqueta") not in ETIQUETAS_NLI:
        raise DatasetInvalido(
            f"{crudo.get('id')}: etiqueta NLI desconocida ({crudo.get('etiqueta')!r})"
        )
    variante = crudo.get("variante_otro_idioma") or {}
    return ParNli(
        id=str(crudo["id"]),
        etiqueta=crudo["etiqueta"],
        fragmento=str(crudo["fragmento"]),
        afirmacion=str(crudo["afirmacion"]),
        idioma_afirmacion=str(crudo["idioma_afirmacion"]),
        idioma_fragmento=str(crudo["idioma_fragmento"]),
        variante_otro_idioma=variante.get("afirmacion"),
    )


def cargar_dataset(directorio: Path, permitir_cc_by_nc: bool = False) -> Dataset:
    """Carga y valida ``directorio``; lanza ``DatasetInvalido`` sin medir si algo incumple (AC-9)."""
    manifiesto = _leer_yaml(directorio / "manifest.yaml")
    fuentes = _validar_manifiesto(manifiesto, permitir_cc_by_nc)
    archivos = manifiesto.get("archivos", {})
    golden = _leer_yaml(directorio / archivos.get("golden", "golden.yaml"))
    nli = _leer_yaml(directorio / archivos.get("nli", "nli-pares.yaml"))
    for nombre, contenido in (("golden", golden), ("nli", nli)):
        if contenido.get("clase") != CLASE_SINTETICA:
            raise DatasetInvalido(f"{nombre} no declara 'clase: sintetico'")

    ids_fuentes = {f.id for f in fuentes}
    preguntas = tuple(_construir_pregunta(p, ids_fuentes) for p in golden.get("preguntas", []))
    pares = tuple(_construir_par(p) for p in nli.get("pares", []))

    if len(preguntas) < MINIMO_PREGUNTAS:
        raise DatasetInvalido(
            f"hay {len(preguntas)} preguntas; se exigen al menos {MINIMO_PREGUNTAS}"
        )
    en_espanol = sum(1 for p in preguntas if p.es_espanol_contra_ingles)
    if en_espanol < MINIMO_PREGUNTAS_ES:
        raise DatasetInvalido(
            f"hay {en_espanol} preguntas es → en; se exigen al menos {MINIMO_PREGUNTAS_ES}"
        )
    if len(pares) < MINIMO_PARES_NLI:
        raise DatasetInvalido(f"hay {len(pares)} pares NLI; se exigen al menos {MINIMO_PARES_NLI}")

    return Dataset(
        nombre=str(manifiesto.get("nombre", directorio.name)),
        version=str(manifiesto.get("version", "")),
        fuentes=fuentes,
        preguntas=preguntas,
        pares_nli=pares,
    )


def cargar_dataset_configurado(directorio: Path) -> Dataset:
    """Carga el dataset con el opt-in de CC BY-NC tomado de la configuración (``ALLOW_CC_BY_NC``, RN-22)."""
    return cargar_dataset(directorio, permitir_cc_by_nc=Settings().allow_cc_by_nc)
