"""Puertos reales de la suite con ``adaptadores.proveedor: local`` (US-233a AC-1, AC-3, AC-4; RN-12, RN-14).

Reutiliza los adapters de producción (mismo cargador que ``MODEL_PROVIDER=local``: embeddings, reranker y NLI por ONNX,
generador por Ollama ``/v1``) y solo añade lo propio de la suite: pre-chequeo de lo que falta, registro de llamadas por
adapter y la lectura del entorno inyectado (``app/config`` sigue siendo el único que lee el proceso, US-037 AC-1).
Nada de lo que se carga o se envía llega a un mensaje de error: solo nombres de variable (RN-14).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING

from pydantic import ValidationError

from app.application.generation import LlmEvidenceGenerator
from app.application.ports import (
    CandidatoParaReranker,
    EvidenceGenerator,
    LanguageDetector,
    LlmClient,
    NliClassifier,
    QueryEmbedder,
    Reranker,
)
from app.application.seed_corpus.ports import PassageEmbedder
from app.config.errores_de_configuracion import describir_errores
from app.config.modelos import ConfigInvalida as ConfigDeModelosInvalida
from app.config.modelos import cargar_config_modelos
from app.config.settings import Settings
from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.chequeo_config import variables_de_modelos_ausentes
from app.evaluation.config_suite import ConfigSuite
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.llamadas import RegistroDeLlamadas
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient
from app.infrastructure.models.verificacion import ModeloNoVerificadoError

if TYPE_CHECKING:  # solo para el tipado: importar local.py carga onnxruntime
    from app.infrastructure.models.local import ModelosDeRecuperacion

CargadorDeModelos = Callable[[Settings], "ModelosDeRecuperacion"]
LectorDeRss = Callable[[], float]
CAMPOS_QUE_NO_SE_TOMAN_DEL_ENTORNO = frozenset({"modelos"})


@dataclass(frozen=True)
class OrigenLocal:
    """De dónde salen los puertos reales: el entorno inyectado, el cargador de pesos y el lector de RSS."""

    entorno: Mapping[str, str]
    cargador: CargadorDeModelos | None
    lector_rss: LectorDeRss


@dataclass(frozen=True)
class PuertosLocales:
    detector_idioma: LanguageDetector
    embedder: QueryEmbedder
    embedder_pasajes: PassageEmbedder
    reranker: Reranker
    clasificador_nli: NliClassifier
    generador: EvidenceGenerator


class EmbedderRegistrado:
    def __init__(self, interno: QueryEmbedder, registro: RegistroDeLlamadas, clase: str) -> None:
        self._interno, self._registro, self._clase = interno, registro, clase

    @property
    def modelo(self) -> str:
        return self._interno.modelo

    def embeber(self, texto: str) -> Sequence[float]:
        self._registro.registrar_en_proceso("embeddings", self._clase, self.modelo)
        return self._interno.embeber(texto)


class EmbedderDePasajesRegistrado:
    def __init__(
        self, interno: PassageEmbedder, registro: RegistroDeLlamadas, clase: str, modelo: str
    ) -> None:
        self._interno, self._registro, self._clase, self._modelo = interno, registro, clase, modelo

    def embeber(self, textos: Sequence[str]) -> list[list[float]]:
        self._registro.registrar_en_proceso("embeddings", self._clase, self._modelo)
        return self._interno.embeber(textos)


class RerankerRegistrado:
    def __init__(self, interno: Reranker, registro: RegistroDeLlamadas, clase: str) -> None:
        self._interno, self._registro, self._clase = interno, registro, clase

    @property
    def version(self) -> str:
        return self._interno.version

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        self._registro.registrar_en_proceso("reranker", self._clase, self.version)
        return self._interno.puntuar(pregunta, candidatos)


class NliRegistrado:
    def __init__(self, interno: NliClassifier, registro: RegistroDeLlamadas, clase: str) -> None:
        self._interno, self._registro, self._clase = interno, registro, clase

    @property
    def version(self) -> str:
        return self._interno.version

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        self._registro.registrar_en_proceso("nli", self._clase, self.version)
        return self._interno.clasificar(pares)


class LlmRegistrado:
    """``LlmClient`` que anota cada llamada con su destino y el modelo antes de enviarla."""

    def __init__(
        self,
        interno: LlmClient,
        registro: RegistroDeLlamadas,
        *,
        destino: str,
        clase: str,
        modelo: str,
    ) -> None:
        self._interno, self._registro = interno, registro
        self._destino, self._clase, self._modelo = destino, clase, modelo

    async def completar_json(self, prompt: str, esquema: Mapping[str, object]) -> str:
        self._registro.registrar(self._destino, self._clase, self._modelo, "llm")
        return await self._interno.completar_json(prompt, esquema)


def _settings_de(config: ConfigSuite, entorno: Mapping[str, str]) -> Settings:
    """``Settings`` con el entorno INYECTADO (nunca el del proceso para las claves de modelos) y el LLM de la suite."""
    try:
        modelos = cargar_config_modelos(entorno)
    except ConfigDeModelosInvalida as error:
        # El mensaje de la configuración trae «CLAVE: motivo» y el motivo puede repetir el valor: solo los nombres.
        variables = [problema.split(":", 1)[0] for problema in str(error).split("; ")]
        raise SuiteAbortada(f"configuración de modelos inválida: {', '.join(variables)}") from None
    campos = {
        clave.lower(): valor
        for clave, valor in entorno.items()
        if clave.lower() in Settings.model_fields
        and clave.lower() not in CAMPOS_QUE_NO_SE_TOMAN_DEL_ENTORNO
    }
    try:
        return Settings(
            _env_file=None,  # type: ignore[call-arg]
            **{
                **campos,
                "modelos": modelos,
                "model_provider": "local",
                "llm_provider": "local",
                "llm_base_url": config.urls["llm"],
                "llm_model": config.llm_modelo,
            },
        )
    except ValidationError as error:
        variables = sorted({e["variable"] for e in describir_errores(error) if "variable" in e})
        raise SuiteAbortada(f"configuración inválida: {', '.join(variables)}") from None


def _cargador_de_produccion(settings: Settings) -> ModelosDeRecuperacion:
    from app.infrastructure.models.local import cargar_modelos_locales

    return cargar_modelos_locales(settings)


def _cargar_modelos(
    settings: Settings, cargador: CargadorDeModelos | None
) -> ModelosDeRecuperacion:
    try:
        return (cargador or _cargador_de_produccion)(settings)
    except ModeloNoVerificadoError as error:  # su mensaje es solo el nombre de la variable
        raise SuiteAbortada(f"no se pudo verificar el modelo de {error.variable}") from None
    except (OSError, ValueError, RuntimeError) as error:  # sin el mensaje: podría llevar rutas
        raise SuiteAbortada(f"no se pudieron cargar los modelos ({type(error).__name__})") from None


def cargar_puertos_locales(
    config: ConfigSuite, origen: OrigenLocal, registro: RegistroDeLlamadas, clase_datos: str
) -> PuertosLocales:
    """Verifica y carga los pesos (o aborta nombrando la variable) y compone el generador; todo adapter registra."""
    ausentes = variables_de_modelos_ausentes(origen.entorno)
    if ausentes:
        raise SuiteAbortada(f"faltan los pesos o su configuración: {', '.join(ausentes)}")
    settings = _settings_de(config, origen.entorno)
    modelos = _cargar_modelos(settings, origen.cargador)
    embedder = modelos.embedder_consulta
    cliente = LlmRegistrado(
        OpenAICompatibleLlmClient(
            settings.llm_base_url,
            settings.llm_model,
            settings.llm_request_timeout_ms,
            settings.llm_max_output_tokens,
            settings.llm_temperature,
        ),
        registro,
        destino=settings.llm_base_url,
        clase=clase_datos,
        modelo=settings.llm_model,
    )
    return PuertosLocales(
        detector_idioma=modelos.detector_idioma,
        embedder=EmbedderRegistrado(embedder, registro, clase_datos),
        embedder_pasajes=EmbedderDePasajesRegistrado(
            modelos.embedder_pasajes, registro, clase_datos, embedder.modelo
        ),
        reranker=RerankerRegistrado(modelos.reranker, registro, clase_datos),
        clasificador_nli=NliRegistrado(modelos.clasificador_nli, registro, clase_datos),
        generador=LlmEvidenceGenerator(
            cliente, settings.details_max_paragraphs, settings.llm_fragments_max_chars
        ),
    )
