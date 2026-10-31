"""Carga tipada de la configuración de la suite `evaluate` (``eval/configs/<cfg>.yaml``, RN-22) y su huella (AC-2)."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.domain.atribucion import CLAIM_MAX_WORDS_INICIAL
from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.evaluation.brazos_recuperacion import REFERENCIA, Brazo
from app.evaluation.reporte import es_identificador
from app.evaluation.rutas import raiz_repo
from app.schemas.generated.models import RetrievalMode

SUITES = ("retrieval", "generation", "pii", "aplicabilidad", "all")
SUITE_COMPLETA = "all"
PROVEEDORES = ("fake", "local")
RELOJES = ("simulado", "real")
SUBCONJUNTOS = ("desarrollo", "validacion", "prueba")
MODOS_DE_RECUPERACION = tuple(m.value for m in RetrievalMode)
FUSIONES = tuple(f.value for f in EstrategiaDeFusion)
ENTORNO_DEL_JUEZ = {
    "modelo": "EVAL_JUDGE_MODEL",
    "base_url": "EVAL_JUDGE_BASE_URL",
    "temperatura": "EVAL_JUDGE_TEMPERATURE",
    "semilla": "EVAL_JUDGE_SEED",
    "acuerdo_minimo": "JUEZ_ACUERDO_MINIMO",
    "muestra_minima": "JUEZ_MUESTRA_MINIMA",
}
"""Claves del juez que ADR-41 deja en variables de entorno (RN-22); lo que digan sustituye al YAML."""
TIMEOUT_DEL_JUEZ_POR_DEFECTO_S = 120.0
ENTORNO_DE_LA_TOLERANCIA = "RETRIEVAL_REGRESSION_TOLERANCE"
"""Variable de entorno de la tolerancia de retroceso (RN-22, US-133); lo que diga sustituye al YAML y no hay valor por defecto."""


class ConfigInvalida(ValueError):
    """La configuración no es utilizable; el mensaje nombra la clave, nunca su valor."""


@dataclass(frozen=True)
class Umbrales:
    relevance_threshold: float
    nli_entailment_threshold: float
    retrieval_top_k: int
    rerank_top_n: int
    claim_max_words: int = CLAIM_MAX_WORDS_INICIAL


@dataclass(frozen=True)
class ConfigJuez:
    """El juez LLM secundario de la fidelidad (ADR-41); ``EVAL_JUDGE_*`` sustituye a lo que diga el YAML."""

    proveedor: str
    modelo: str
    base_url: str | None
    temperatura: float
    semilla: int
    timeout_s: float
    acuerdo_minimo: float
    """``JUEZ_ACUERDO_MINIMO`` (RN-22): bajo este acuerdo con el NLI la fidelidad del juez es «no concluyente»."""
    muestra_minima: int
    """``JUEZ_MUESTRA_MINIMA`` (RN-22): con menos afirmaciones comparadas la fidelidad del juez es «no concluyente»."""


@dataclass(frozen=True)
class Barrido:
    """``RELEVANCE_THRESHOLD_GRID`` y la regla D1 del barrido (US-073); el umbral de referencia no cambia al fijar el elegido."""

    grilla: tuple[float, ...]
    umbral_de_referencia: float
    tolerancia_recall: float


@dataclass(frozen=True)
class Comparacion:
    """La comparación de brazos de recuperación (US-133): A0 *dense* primero, luego las variantes híbridas."""

    brazos: tuple[Brazo, ...]
    tolerancia_retroceso: float
    """``RETRIEVAL_REGRESSION_TOLERANCE`` (RN-22) en puntos absolutos; sin valor por defecto: la fija la preinscripción P1."""


@dataclass(frozen=True)
class ConfigSuite:
    nombre: str
    fixture: str
    dataset: Path
    subconjunto: str | None
    particion: Path | None
    semilla_bootstrap: int
    bootstrap_repeticiones: int
    reloj: str
    proveedor: str
    urls: dict[str, str]
    llm_modelo: str
    umbrales: Umbrales
    catalogo_version: str
    ruta_terminos: Path
    hash_config: str
    juez: ConfigJuez | None = None
    informe_pii: Path | None = None
    """Ruta del JSON de `npm run eval:pii` (B1); ``--informe-pii`` la sustituye."""
    barrido: Barrido | None = None
    rss_limite_mib: float | None = None
    """Límite de memoria (MiB) con el que se marca el RSS máximo en el reporte local (US-233a AC-7, RN-22); obligatorio
    con ``proveedor: local``."""
    origen: Mapping[str, Any] | None = None
    """Bloque ``origen`` de la medición de US-236 (pregunta de la demo y ``EVAL_ORIGIN_RUNS``); ``None`` en el resto."""
    comparacion: Comparacion | None = None
    """Bloque ``comparacion`` de US-133: varios brazos de recuperación en una sola corrida; ``None`` en el resto."""


def huella_de_config(crudo: dict[str, Any]) -> str:
    """SHA-256 del YAML cargado, serializado de forma canónica (claves ordenadas, sin espacios)."""
    canonico = json.dumps(crudo, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def clave_de(crudo: dict[str, Any], *ruta: str) -> Any:
    valor: Any = crudo
    for parte in ruta:
        if not isinstance(valor, dict) or parte not in valor:
            raise ConfigInvalida(f"falta la clave {'.'.join(ruta)}")
        valor = valor[parte]
    return valor


def _en(valor: str, permitidos: tuple[str, ...], clave: str) -> str:
    if valor not in permitidos:
        raise ConfigInvalida(f"la clave {clave} debe ser una de {', '.join(permitidos)}")
    return valor


def ruta_del_repo(valor: str) -> Path:
    ruta = Path(valor)
    return ruta if ruta.is_absolute() else raiz_repo() / ruta


def _con_juez_efectivo(crudo: dict[str, Any], entorno: Mapping[str, str]) -> dict[str, Any]:
    """El bloque ``juez`` del YAML con ``EVAL_JUDGE_*`` encima; una URL por entorno vuelve local al juez.

    El resultado es lo que se hashea: cambiar el juez por entorno cambia la huella de la configuración (AC-2).
    """
    juez = dict(crudo.get("juez") or {})
    for clave, variable in ENTORNO_DEL_JUEZ.items():
        if entorno.get(variable):
            juez[clave] = entorno[variable]
    if entorno.get(ENTORNO_DEL_JUEZ["base_url"]):
        juez["proveedor"] = "local"
    return {**crudo, "juez": juez} if juez else crudo


def _con_tolerancia_efectiva(crudo: dict[str, Any], entorno: Mapping[str, str]) -> dict[str, Any]:
    """``RETRIEVAL_REGRESSION_TOLERANCE`` del entorno, si viene, sobre ``comparacion.tolerancia_retroceso`` (RN-22)."""
    if not entorno.get(ENTORNO_DE_LA_TOLERANCIA) or not isinstance(crudo.get("comparacion"), dict):
        return crudo
    comparacion = {
        **crudo["comparacion"],
        "tolerancia_retroceso": entorno[ENTORNO_DE_LA_TOLERANCIA],
    }
    return {**crudo, "comparacion": comparacion}


def _exigir_fraccion(valor: object, clave: str) -> None:
    try:
        numero = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise ConfigInvalida(f"{clave} debe ser un número") from None
    if not 0.0 <= numero <= 1.0:
        raise ConfigInvalida(f"{clave} debe estar en [0, 1]")


def minimos_del_juez(config: ConfigSuite) -> tuple[float | None, int | None]:
    """(``JUEZ_ACUERDO_MINIMO``, ``JUEZ_MUESTRA_MINIMA``) de la configuración; ``(None, None)`` si no hay juez."""
    if config.juez is None:
        return None, None
    return config.juez.acuerdo_minimo, config.juez.muestra_minima


def _exigir_entero_positivo(valor: object, clave: str) -> int:
    texto = str(valor).strip()
    if not texto.isascii() or not texto.isdigit() or int(texto) < 1:
        raise ConfigInvalida(f"{clave} debe ser un entero positivo")
    return int(texto)


def _leer_juez(crudo: dict[str, Any]) -> ConfigJuez | None:
    juez = crudo.get("juez")
    if not juez:
        return None
    proveedor = _en(str(juez.get("proveedor", "local")), PROVEEDORES, "juez.proveedor")
    base_url = str(juez["base_url"]) if juez.get("base_url") else None
    if proveedor == "local" and base_url is None:
        raise ConfigInvalida("un juez local exige juez.base_url (EVAL_JUDGE_BASE_URL)")
    modelo = str(clave_de(juez, "modelo"))
    if not es_identificador(
        modelo
    ):  # antes de cualquier request: Ollama resuelve nombres con espacios o control
        raise ConfigInvalida("juez.modelo no es un identificador válido (sin espacios ni control)")
    acuerdo_minimo = clave_de(juez, "acuerdo_minimo")  # RN-22: sin valor por defecto en código
    _exigir_fraccion(acuerdo_minimo, "juez.acuerdo_minimo")
    muestra_minima = _exigir_entero_positivo(  # RN-22: sin valor por defecto en código
        clave_de(juez, "muestra_minima"), "juez.muestra_minima"
    )
    try:
        return ConfigJuez(
            proveedor=proveedor,
            modelo=modelo,
            base_url=base_url,
            temperatura=float(juez.get("temperatura", 0.0)),
            semilla=int(juez.get("semilla", 0)),
            timeout_s=float(juez.get("timeout_s", TIMEOUT_DEL_JUEZ_POR_DEFECTO_S)),
            acuerdo_minimo=float(acuerdo_minimo),
            muestra_minima=muestra_minima,
        )
    except (TypeError, ValueError):
        raise ConfigInvalida(
            "juez.temperatura, juez.semilla, juez.timeout_s y juez.acuerdo_minimo deben ser números"
        ) from None


def _barrido_de(crudo: dict[str, Any]) -> Barrido | None:
    seccion = crudo.get("barrido")
    if seccion is None:
        return None
    grilla = tuple(float(v) for v in clave_de(seccion, "relevance_threshold_grid"))
    referencia = float(clave_de(seccion, "umbral_de_referencia"))
    tolerancia = float(clave_de(seccion, "tolerancia_recall"))
    if not grilla or any(not 0.0 <= v <= 1.0 for v in grilla):
        raise ConfigInvalida("barrido.relevance_threshold_grid debe tener valores en [0, 1]")
    if referencia not in grilla:
        raise ConfigInvalida("barrido.umbral_de_referencia debe estar en la grilla")
    if not 0.0 <= tolerancia <= 1.0:
        raise ConfigInvalida("barrido.tolerancia_recall debe estar en [0, 1]")
    return Barrido(grilla, referencia, tolerancia)


def _limite_de_rss(crudo: dict[str, Any]) -> float | None:
    """``medicion.rss_limite_mib``: sin valor por defecto en código (RN-22). Exigirlo al correr la suite con modelos
    reales es de ``exigir_proveedor_local``: otras herramientas cargan esta configuración sin medir el NLI."""
    limite = crudo["medicion"].get("rss_limite_mib")
    if limite is None:
        return None
    try:
        numero = float(limite)
    except (TypeError, ValueError):
        raise ConfigInvalida("medicion.rss_limite_mib debe ser un número") from None
    if numero <= 0:
        raise ConfigInvalida("medicion.rss_limite_mib debe ser positivo")
    return numero


def _brazo_de(crudo: object) -> Brazo:
    if not isinstance(crudo, dict):
        raise ConfigInvalida("cada brazo de comparacion.brazos debe ser un mapa")
    nombre = str(clave_de(crudo, "nombre"))
    if not es_identificador(nombre):
        raise ConfigInvalida("el nombre de un brazo no es un identificador válido")
    modo = RetrievalMode(
        _en(str(clave_de(crudo, "RETRIEVAL_MODE")), MODOS_DE_RECUPERACION, "RETRIEVAL_MODE")
    )
    if modo is RetrievalMode.dense:
        return Brazo(nombre, modo)
    fusion = EstrategiaDeFusion(
        _en(str(clave_de(crudo, "RETRIEVAL_FUSION")), FUSIONES, "RETRIEVAL_FUSION")
    )
    if fusion is EstrategiaDeFusion.rrf:
        return Brazo(
            nombre, modo, fusion, rrf_k=_exigir_entero_positivo(clave_de(crudo, "RRF_K"), "RRF_K")
        )
    peso = _numero(clave_de(crudo, "HYBRID_SPARSE_WEIGHT"), "HYBRID_SPARSE_WEIGHT")
    if not 0.0 < peso < 1.0:
        raise ConfigInvalida("HYBRID_SPARSE_WEIGHT debe estar en (0, 1)")
    return Brazo(nombre, modo, fusion, peso_sparse=peso)


def _numero(valor: object, clave: str) -> float:
    try:
        return float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        raise ConfigInvalida(f"{clave} debe ser un número") from None


def _comparacion_de(crudo: dict[str, Any], subconjunto: str | None) -> Comparacion | None:
    """``comparacion`` (US-133): A0 *dense* de referencia primero, nombres únicos, solo el conjunto de desarrollo
    (ADR-45 P2) y una tolerancia sin valor por defecto."""
    seccion = crudo.get("comparacion")
    if seccion is None:
        return None
    if subconjunto != "desarrollo":
        raise ConfigInvalida(
            "la comparación solo evalúa dataset.subconjunto: desarrollo (ADR-45 P2)"
        )
    brazos = tuple(_brazo_de(b) for b in clave_de(seccion, "brazos"))
    if (
        len(brazos) < 2
        or brazos[0].nombre != REFERENCIA
        or brazos[0].modo is not RetrievalMode.dense
    ):
        raise ConfigInvalida(
            f"comparacion.brazos debe empezar por {REFERENCIA} (dense) y tener otro brazo"
        )
    if len({b.nombre for b in brazos}) != len(brazos):
        raise ConfigInvalida("los nombres de comparacion.brazos deben ser únicos")
    tolerancia = _numero(clave_de(seccion, "tolerancia_retroceso"), "tolerancia_retroceso")
    if not 0.0 <= tolerancia <= 1.0:
        raise ConfigInvalida("comparacion.tolerancia_retroceso debe estar en [0, 1]")
    return Comparacion(brazos, tolerancia)


def cargar_config_suite(ruta: Path, entorno: Mapping[str, str] | None = None) -> ConfigSuite:
    try:
        crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        raise ConfigInvalida("la configuración no se pudo leer") from None
    if not isinstance(crudo, dict):
        raise ConfigInvalida("la configuración no es un mapa YAML")
    crudo = _con_tolerancia_efectiva(_con_juez_efectivo(crudo, entorno or {}), entorno or {})
    umbrales = clave_de(crudo, "umbrales")
    dataset = clave_de(crudo, "dataset")
    sub = dataset.get("subconjunto")
    particion = dataset.get("particion") if sub else None
    if sub and not particion:
        raise ConfigInvalida("dataset.subconjunto exige dataset.particion")
    return ConfigSuite(
        nombre=str(clave_de(crudo, "nombre")),
        fixture=str(clave_de(crudo, "fixture")),
        dataset=ruta_del_repo(str(clave_de(dataset, "ruta"))),
        subconjunto=_en(sub, SUBCONJUNTOS, "dataset.subconjunto") if sub else None,
        particion=ruta_del_repo(str(particion)) if particion else None,
        semilla_bootstrap=int(clave_de(crudo, "semilla_bootstrap")),
        bootstrap_repeticiones=int(clave_de(crudo, "bootstrap_repeticiones")),
        reloj=_en(str(clave_de(crudo, "medicion", "reloj")), RELOJES, "medicion.reloj"),
        proveedor=_en(
            str(clave_de(crudo, "adaptadores", "proveedor")), PROVEEDORES, "adaptadores.proveedor"
        ),
        urls={str(k): str(v) for k, v in (crudo["adaptadores"].get("urls") or {}).items()},
        llm_modelo=str(clave_de(crudo, "modelos", "llm")),
        umbrales=Umbrales(
            relevance_threshold=float(clave_de(umbrales, "relevance_threshold")),
            nli_entailment_threshold=float(clave_de(umbrales, "nli_entailment_threshold")),
            retrieval_top_k=int(clave_de(umbrales, "retrieval_top_k")),
            rerank_top_n=int(clave_de(umbrales, "rerank_top_n")),
            claim_max_words=int(umbrales.get("claim_max_words", CLAIM_MAX_WORDS_INICIAL)),
        ),
        catalogo_version=str(clave_de(crudo, "catalogo", "version")),
        ruta_terminos=ruta_del_repo(str(clave_de(crudo, "catalogo", "ruta_terminos"))),
        hash_config=huella_de_config(crudo),
        juez=_leer_juez(crudo),
        informe_pii=(
            ruta_del_repo(str(crudo["pii"]["informe_b1"]))
            if (crudo.get("pii") or {}).get("informe_b1")
            else None
        ),
        barrido=_barrido_de(crudo),
        rss_limite_mib=_limite_de_rss(crudo),
        origen=crudo.get("origen"),
        comparacion=_comparacion_de(crudo, sub),
    )
