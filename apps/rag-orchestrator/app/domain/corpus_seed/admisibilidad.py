"""Admisibilidad de un documento de la semilla por fuente y licencia (RN-21, D-09, ADR-36)."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import urlsplit

from app.domain.corpus_seed.documento import DocumentoDeSemilla


class ClaseDeLicencia(StrEnum):
    """Los cuatro valores de ``corpus_document.license_class`` (data-model §4.6) según el dominio; el contrato generado (``LicenseClass``) debe coincidir (lo fija un test)."""

    DOMINIO_PUBLICO = "dominio_publico"
    CC_BY = "cc_by"
    CC_BY_SA = "cc_by_sa"
    CC_BY_NC = "cc_by_nc"


# Cláusulas por palabra aparte (no dentro de otra: "NCI" no es NC) o por su nombre largo, en inglés y en español.
_CLAUSULA_ND = re.compile(
    r"(?<![a-z])nd(?![a-z])|noderiv|no[\s-]?derivative|sin\s+obras?\s+derivadas?", re.IGNORECASE
)
_CLAUSULA_NC = re.compile(
    r"(?<![a-z])nc(?![a-z])|non[\s-]?commercial|no[\s-]?comercial|sin\s+fines\s+comerciales",
    re.IGNORECASE,
)
_CLAUSULA_SA = re.compile(
    r"(?<![a-z])sa(?![a-z])|share[\s-]?alike|compartir[\s-]?igual", re.IGNORECASE
)

# PISO de fuentes que no se pueden ingerir (RN-21, D-09), con su nombre largo y su host. Vive en el código: ``CORPUS_EXCLUDED_SOURCES``
# (configuración) solo puede AMPLIARLO, nunca quitar NCCN ni ESMO. Sin excepciones: «ESMO Open» se rechaza (falla cerrado);
# admitirla exigiría una excepción explícita revisada legalmente (design.md).
PISO_DE_FUENTES_EXCLUIDAS: tuple[str, ...] = ("NCCN", "ESMO")
ALIAS_DE_FUENTES_EXCLUIDAS: Mapping[str, tuple[str, ...]] = {
    "nccn": ("national comprehensive cancer network",),
    "esmo": ("european society for medical oncology",),
}
HOSTS_DE_FUENTES_EXCLUIDAS: Mapping[str, tuple[str, ...]] = {
    "nccn": ("nccn.org",),
    "esmo": ("esmo.org",),
}


class MotivoDeRechazo(StrEnum):
    FUENTE_EXCLUIDA = "fuente_excluida"
    SIN_LICENCIA = "sin_licencia"
    LICENCIA_NO_ACEPTADA = "licencia_no_aceptada"


@dataclass(frozen=True)
class PoliticaDeLicencias:
    """Lo que la configuración (RN-22) decide: clases aceptadas, fuentes excluidas y la tabla licencia -> clase."""

    aceptadas: frozenset[str]
    excluidas: tuple[str, ...]
    mapa_de_clases: Mapping[str, str]
    permitir_cc_by_nc: bool = False

    def fuentes_excluidas(self) -> tuple[str, ...]:
        """Las fuentes excluidas efectivas: la configuración más las del piso que le falten (esta solo puede ampliarlo)."""
        presentes = {normalizar_clave(fuente) for fuente in self.excluidas}
        faltan = tuple(f for f in PISO_DE_FUENTES_EXCLUIDAS if normalizar_clave(f) not in presentes)
        return (*self.excluidas, *faltan)


@dataclass(frozen=True)
class Admision:
    motivo: MotivoDeRechazo | None
    license_class: str | None = None

    @property
    def admitido(self) -> bool:
        return self.motivo is None


def clase_contradice_el_texto(texto: str, clase: str) -> bool:
    """La clave de la tabla dice una cosa y la clase otra (RN-21): ND nunca; NC solo a cc_by_nc; SA solo a cc_by_sa."""
    return (
        contiene_nd(texto)
        or (contiene_nc(texto) and clase != ClaseDeLicencia.CC_BY_NC)
        or (contiene_sa(texto) and not contiene_nc(texto) and clase != ClaseDeLicencia.CC_BY_SA)
    )


def contiene_nd(texto: str) -> bool:
    return _CLAUSULA_ND.search(texto) is not None


def contiene_nc(texto: str) -> bool:
    return _CLAUSULA_NC.search(texto) is not None


def contiene_sa(texto: str) -> bool:
    return _CLAUSULA_SA.search(texto) is not None


def evaluar_admisibilidad(documento: DocumentoDeSemilla, politica: PoliticaDeLicencias) -> Admision:
    # La fuente excluida se decide ANTES que la licencia: NCCN se rechaza aunque declare una aceptada (D-09).
    if es_fuente_excluida(documento, politica):
        return Admision(MotivoDeRechazo.FUENTE_EXCLUIDA)
    if not documento.license:
        return Admision(MotivoDeRechazo.SIN_LICENCIA)
    clase = clase_de_licencia(documento.license, politica.mapa_de_clases)
    if clase not in politica.aceptadas or not _cumple_condiciones_de_nc(clase, documento, politica):
        return Admision(MotivoDeRechazo.LICENCIA_NO_ACEPTADA)
    return Admision(None, clase)


def _cumple_condiciones_de_nc(
    clase: str | None, documento: DocumentoDeSemilla, politica: PoliticaDeLicencias
) -> bool:
    """CC BY-NC solo en el MVP académico (RN-21): además de estar aceptada exige ``ALLOW_CC_BY_NC`` y la marca del documento."""
    if clase != ClaseDeLicencia.CC_BY_NC:
        return True
    return politica.permitir_cc_by_nc and documento.nc_solo_academico


def es_fuente_excluida(documento: DocumentoDeSemilla, politica: PoliticaDeLicencias) -> bool:
    """Falla cerrado (D-09): nombre, alias o token del nombre de la fuente, o host de su identificador o URL.

    Usa las fuentes excluidas EFECTIVAS (el piso del código más la configuración). Los hosts salen solo de la tabla del
    código: no se inventan para una fuente agregada por configuración.
    """
    nombres = {normalizar_clave(fuente) for fuente in politica.fuentes_excluidas()}
    for fuente in list(nombres):
        nombres.update(ALIAS_DE_FUENTES_EXCLUIDAS.get(fuente, ()))
    nombre_de_la_fuente = _sin_puntos_de_sigla(documento.source_name.casefold())
    palabras = f" {' '.join(re.findall(r'\w+', nombre_de_la_fuente))} "
    if any(f" {' '.join(re.findall(r'\w+', nombre))} " in palabras for nombre in nombres):
        return True
    hosts = {host for fuente in nombres for host in HOSTS_DE_FUENTES_EXCLUIDAS.get(fuente, ())}
    return any(
        _host_de(valor) == host or _host_de(valor).endswith(f".{host}")
        for valor in (documento.external_id, documento.url_fuente)
        for host in hosts
    )


def _sin_puntos_de_sigla(texto: str) -> str:
    """``n.c.c.n.`` -> ``nccn.``: quita el punto entre letras sueltas; «Dr. N. C. Smith» (con espacios) no cambia."""
    return re.sub(r"(?<=\b\w)\.(?=\w\b)", "", texto)


def _host_de(valor: str | None) -> str:
    if not valor:
        return ""
    candidato = valor.strip()
    if "://" not in candidato and not candidato.startswith("//"):
        candidato = (
            f"//{candidato}"  # «nccn.org/guidelines» sin esquema: urlsplit lo tomaría por ruta
        )
    return (urlsplit(candidato).hostname or "").casefold()


def normalizar_clave(texto: str) -> str:
    """Forma de comparación de licencias y fuentes: sin mayúsculas, sin espacios de los extremos ni repetidos."""
    return " ".join(texto.casefold().split())


def clase_de_licencia(licencia: str, mapa_de_clases: Mapping[str, str]) -> str | None:
    """``license_class`` del texto literal de la licencia según la tabla de configuración; ``None`` si no mapea.

    El texto manda sobre la tabla (RN-21): una licencia ND no tiene clase aunque la tabla la contuviera por error y una
    NC es siempre ``cc_by_nc`` aunque la tabla diga otra.
    """
    if contiene_nd(licencia):
        return None
    if contiene_nc(licencia):
        return ClaseDeLicencia.CC_BY_NC
    tabla = {normalizar_clave(texto): clase for texto, clase in mapa_de_clases.items()}
    return tabla.get(normalizar_clave(licencia))
