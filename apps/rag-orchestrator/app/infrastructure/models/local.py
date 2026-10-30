"""Modelos locales: verificación de los pesos y construcción de los adapters (MODEL_PROVIDER=local).

Recuperación (US-231a: embeddings y reranker) y soporte NLI (US-231b). Un archivo cargado = una ruta y un SHA-256 en la
configuración; el arranque verifica TODOS antes de construir nada, y las sesiones de ONNX Runtime se crean desde los
bytes que se acaban de verificar.
"""

from __future__ import annotations

import io
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from pydantic import ValidationError

from app.application.corpus_ingestion.ports import SparsePassageEncoder
from app.application.ports import (
    LanguageDetector,
    NliClassifier,
    QueryEmbedder,
    QuerySparseEncoder,
    Reranker,
)
from app.application.seed_corpus.ports import PassageEmbedder
from app.config.modelos import ConfigModelos
from app.config.settings import AjustesSparse, Settings
from app.domain.modelos import describir_modelo
from app.domain.nli import (
    ETIQUETAS_NLI,
    IndicesDeClase,
    IndicesDeClaseInvalidos,
    validar_indices_de_clase,
)
from app.infrastructure.embeddings.bge_m3 import (
    EmbedderDeConsultaBgeM3,
    EmbedderDePasajesBgeM3,
    NucleoBgeM3,
)
from app.infrastructure.embeddings.bge_m3_sparse import (
    CodificadorSparseBgeM3,
    CodificadorSparseDeConsultaBgeM3,
)
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.models.onnx import (
    DatosExternosNoResueltos,
    SesionOnnx,
    TokenizadorDeArchivo,
)
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador
from app.infrastructure.models.verificacion import (
    ModeloNoVerificadoError,
    leer_modelo_verificado,
    verificar_modelo,
)
from app.infrastructure.nli.mdeberta import ClasificadorNliMdeberta, SalidaConClasesInesperadas
from app.infrastructure.reranker.bge_reranker import BgeReranker

# (variable de la ruta, variable del SHA-256) por cada archivo que se carga: modelo ONNX y tokenizer de cada modelo.
ARCHIVOS_A_VERIFICAR: tuple[tuple[str, str], ...] = (
    ("EMBEDDING_MODEL_PATH", "EMBEDDING_MODEL_SHA256"),
    ("EMBEDDING_TOKENIZER_PATH", "EMBEDDING_TOKENIZER_SHA256"),
    ("RERANKER_MODEL_PATH", "RERANKER_MODEL_SHA256"),
    ("RERANKER_TOKENIZER_PATH", "RERANKER_TOKENIZER_SHA256"),
    ("NLI_MODEL_PATH", "NLI_MODEL_SHA256"),
    ("NLI_TOKENIZER_PATH", "NLI_TOKENIZER_SHA256"),
)
# Solo se verifica si se declara (el ONNX del NLI se reexporta en un solo archivo); un ONNX que sí referencia datos
# externos sin este par no arranca (D12).
PAR_DE_DATOS_EXTERNOS_DEL_NLI = ("NLI_MODEL_DATA_PATH", "NLI_MODEL_DATA_SHA256")
PARES_DE_EMBEDDINGS = ARCHIVOS_A_VERIFICAR[:2]


@dataclass(frozen=True)
class ModelosDeRecuperacion:
    """Los adapters reales ya construidos (un núcleo de embeddings para los dos puertos y el NLI de soporte)."""

    detector_idioma: LanguageDetector
    embedder_consulta: QueryEmbedder
    embedder_pasajes: PassageEmbedder
    reranker: Reranker
    clasificador_nli: NliClassifier
    embedder_sparse_consulta: QuerySparseEncoder | None = None
    """Solo con ``RETRIEVAL_MODE=hibrida`` (US-112): el mismo codificador *sparse* de la ingesta, aplicado a la consulta."""


def cargar_modelos_locales(
    settings: Settings,
    *,
    fabricar_sesion: Callable[..., SesionDeInferencia] = SesionOnnx.desde_bytes,
    fabricar_tokenizador: Callable[[Path], Tokenizador] = TokenizadorDeArchivo,
) -> ModelosDeRecuperacion:
    """Verifica los pesos y construye los adapters. Falla con ``ModeloNoVerificadoError`` nombrando la variable.

    Las fábricas se inyectan para que la CI, que no tiene pesos reales (RN-14), ejercite el cableado completo.
    Nada que identifique un modelo se calcula hasta que TODOS sus archivos están verificados.
    """
    config = _exigir_configuracion_de_modelos(settings)
    indices_nli = _indices_de_clase_del_nli(settings)
    rutas = verificar_modelos_locales(settings)
    sesion_embeddings, tokenizador_embeddings = _cargar_modelo(
        settings, rutas, "EMBEDDING", fabricar_sesion, fabricar_tokenizador
    )
    sesion_reranker, tokenizador_reranker = _cargar_modelo(
        settings, rutas, "RERANKER", fabricar_sesion, fabricar_tokenizador
    )
    sesion_nli, tokenizador_nli = _cargar_modelo(
        settings, rutas, "NLI", fabricar_sesion, fabricar_tokenizador
    )
    nucleo = _nucleo_de_embeddings(settings, config, sesion_embeddings, tokenizador_embeddings)
    clasificador_nli = _clasificador_nli(settings, config, indices_nli, sesion_nli, tokenizador_nli)
    _comprobar_las_tres_clases_del_nli(clasificador_nli)
    sparse_de_consulta = _sparse_de_consulta_si_es_hibrida(
        settings, sesion_embeddings, tokenizador_embeddings
    )
    return ModelosDeRecuperacion(
        detector_idioma=DetectorDeIdiomaLocal(settings.default_query_language),
        embedder_consulta=EmbedderDeConsultaBgeM3(nucleo),
        embedder_pasajes=EmbedderDePasajesBgeM3(nucleo),
        reranker=_reranker(settings, config, sesion_reranker, tokenizador_reranker),
        clasificador_nli=clasificador_nli,
        embedder_sparse_consulta=sparse_de_consulta,
    )


def _sparse_de_consulta_si_es_hibrida(
    settings: Settings, sesion: SesionDeInferencia, tokenizador: Tokenizador
) -> QuerySparseEncoder | None:
    """El codificador *sparse* de la consulta, solo en modo híbrido; sus pesos se verifican con SHA-256 (RN-22).

    Una clave de ``AjustesSparse`` ausente o inválida falla al arrancar nombrando la variable, nunca su valor.
    """
    if settings.retrieval_mode != "hibrida":
        return None
    try:
        ajustes = AjustesSparse(_env_file=None)  # type: ignore[call-arg]
    except ValidationError as error:
        variable = str(error.errors()[0]["loc"][0]).upper()
        raise ModeloNoVerificadoError(variable) from None
    pesos, sesgo = _pesos_del_sparse_del_modelo(settings, ajustes)
    return CodificadorSparseDeConsultaBgeM3(
        _codificador_sparse(settings, pesos, sesgo, sesion, tokenizador)
    )


def _pesos_del_sparse_del_modelo(
    settings: Settings, ajustes_sparse: AjustesSparse
) -> tuple[np.ndarray, float]:
    pesos, sesgo = _pesos_sparse_verificados(ajustes_sparse)
    if pesos.size != _exigir_configuracion_de_modelos(settings).embedding_dim:
        # Falla al cargar, no por documento: los pesos no son los de la cabeza del modelo configurado.
        raise ModeloNoVerificadoError("EMBEDDING_SPARSE_WEIGHTS_PATH")
    return pesos, sesgo


def _codificador_sparse(
    settings: Settings,
    pesos: np.ndarray,
    sesgo: float,
    sesion: SesionDeInferencia,
    tokenizador: Tokenizador,
) -> CodificadorSparseBgeM3:
    """Una sola construcción para la ingesta y la consulta: misma sesión, pesos, ``max_length`` y lotes (US-112 D6)."""
    return CodificadorSparseBgeM3(
        sesion,
        tokenizador,
        pesos=pesos,
        sesgo=sesgo,
        max_length=settings.embedding_max_length,
        max_tokens_por_lote=settings.model_batch_max_tokens,
    )


def cargar_embedder_de_pasajes(
    settings: Settings,
    *,
    fabricar_sesion: Callable[..., SesionDeInferencia] = SesionOnnx.desde_bytes,
    fabricar_tokenizador: Callable[[Path], Tokenizador] = TokenizadorDeArchivo,
) -> PassageEmbedder:
    """El ``PassageEmbedder`` real para el cargador de la semilla: verifica SOLO los archivos que ese proceso abre
    (modelo y tokenizer de embeddings) y construye el mismo adapter de US-231a."""
    return EmbedderDePasajesBgeM3(
        _nucleo_de_pasajes(settings, fabricar_sesion, fabricar_tokenizador)[0]
    )


def cargar_embeddings_y_sparse_de_pasajes(
    settings: Settings,
    ajustes_sparse: AjustesSparse,
    *,
    fabricar_sesion: Callable[..., SesionDeInferencia] = SesionOnnx.desde_bytes,
    fabricar_tokenizador: Callable[[Path], Tokenizador] = TokenizadorDeArchivo,
) -> tuple[PassageEmbedder, SparsePassageEncoder]:
    """El ``PassageEmbedder`` y el ``SparsePassageEncoder`` reales de la ingesta (US-117a D3) sobre UNA sola sesión.

    Verifica los archivos de embeddings y los pesos de ``sparse_linear`` (ruta y SHA-256 de ``AjustesSparse``,
    RN-22) antes de construir nada. Un fallo nombra solo la variable.
    """
    pesos, sesgo = _pesos_del_sparse_del_modelo(settings, ajustes_sparse)
    nucleo, sesion, tokenizador = _nucleo_de_pasajes(
        settings, fabricar_sesion, fabricar_tokenizador
    )
    codificador = _codificador_sparse(settings, pesos, sesgo, sesion, tokenizador)
    return EmbedderDePasajesBgeM3(nucleo), codificador


def cargar_clasificador_nli(
    settings: Settings,
    *,
    fabricar_sesion: Callable[..., SesionDeInferencia] = SesionOnnx.desde_bytes,
    fabricar_tokenizador: Callable[[Path], Tokenizador] = TokenizadorDeArchivo,
) -> ClasificadorNliMdeberta:
    """El NLI real para la ingesta (US-118): verifica SOLO los archivos que ese proceso abre (modelo, tokenizer y, si se
    declaran, los datos externos del NLI) y construye el mismo adapter de US-231b que usa ``/rag/query``."""
    config = _exigir_configuracion_de_modelos(settings)
    indices = _indices_de_clase_del_nli(settings)
    pares = ARCHIVOS_A_VERIFICAR[4:6]
    if settings.nli_model_data_path or settings.nli_model_data_sha256:
        pares += (PAR_DE_DATOS_EXTERNOS_DEL_NLI,)
    rutas = verificar_modelos_locales(settings, pares)
    sesion, tokenizador = _cargar_modelo(
        settings, rutas, "NLI", fabricar_sesion, fabricar_tokenizador
    )
    clasificador = _clasificador_nli(settings, config, indices, sesion, tokenizador)
    _comprobar_las_tres_clases_del_nli(clasificador)
    return clasificador


def _nucleo_de_pasajes(
    settings: Settings,
    fabricar_sesion: Callable[..., SesionDeInferencia],
    fabricar_tokenizador: Callable[[Path], Tokenizador],
) -> tuple[NucleoBgeM3, SesionDeInferencia, Tokenizador]:
    config = _exigir_configuracion_de_modelos(settings)
    rutas = verificar_modelos_locales(settings, PARES_DE_EMBEDDINGS)
    sesion, tokenizador = _cargar_modelo(
        settings, rutas, "EMBEDDING", fabricar_sesion, fabricar_tokenizador
    )
    return _nucleo_de_embeddings(settings, config, sesion, tokenizador), sesion, tokenizador


def _pesos_sparse_verificados(ajustes: AjustesSparse) -> tuple[np.ndarray, float]:
    """Pesos y sesgo de la cabeza lineal del *sparse*, leídos una vez y con el SHA-256 de esos mismos bytes."""
    variable_ruta, variable_sha = "EMBEDDING_SPARSE_WEIGHTS_PATH", "EMBEDDING_SPARSE_WEIGHTS_SHA256"
    contenido = leer_modelo_verificado(
        variable_ruta,
        variable_sha,
        ajustes.embedding_sparse_weights_path,
        ajustes.embedding_sparse_weights_sha256,
    )
    try:
        datos = np.load(io.BytesIO(contenido), allow_pickle=False)
        return np.asarray(datos["weight"], dtype=np.float32).reshape(-1), float(
            np.asarray(datos["bias"]).reshape(-1)[0]
        )
    except Exception:  # noqa: BLE001 - un npz ilegible o sin weight/bias: se nombra la ruta, no el motivo
        raise ModeloNoVerificadoError(variable_ruta) from None


def _nucleo_de_embeddings(
    settings: Settings, config: ConfigModelos, sesion: SesionDeInferencia, tokenizador: Tokenizador
) -> NucleoBgeM3:
    return NucleoBgeM3(
        sesion,
        tokenizador,
        modelo=describir_modelo(
            config.embedding_model,
            config.embedding_model_revision,
            str(settings.embedding_model_sha256),
        ),
        dimension=config.embedding_dim,
        max_length=settings.embedding_max_length,
        max_tokens_por_lote=settings.model_batch_max_tokens,
    )


def _reranker(
    settings: Settings, config: ConfigModelos, sesion: SesionDeInferencia, tokenizador: Tokenizador
) -> BgeReranker:
    return BgeReranker(
        sesion,
        tokenizador,
        version=describir_modelo(
            config.reranker_model,
            config.reranker_model_revision,
            str(settings.reranker_model_sha256),
        ),
        max_length=config.reranker_max_length,
        max_pairs=config.reranker_max_pairs,
        max_tokens_por_lote=settings.model_batch_max_tokens,
    )


def _clasificador_nli(
    settings: Settings,
    config: ConfigModelos,
    indices: IndicesDeClase,
    sesion: SesionDeInferencia,
    tokenizador: Tokenizador,
) -> ClasificadorNliMdeberta:
    return ClasificadorNliMdeberta(
        sesion,
        tokenizador,
        version=describir_modelo(
            config.nli_model, config.nli_model_revision, str(settings.nli_model_sha256)
        ),
        indices=indices,
        max_length=settings.nli_max_length,
        max_tokens_por_lote=settings.model_batch_max_tokens,
    )


def archivos_a_verificar(settings: Settings) -> tuple[tuple[str, str], ...]:
    """Los pares fijos más el de datos externos del NLI cuando el entorno declara alguna de sus dos variables."""
    declara_datos = settings.nli_model_data_path or settings.nli_model_data_sha256
    return ARCHIVOS_A_VERIFICAR + ((PAR_DE_DATOS_EXTERNOS_DEL_NLI,) if declara_datos else ())


def verificar_modelos_locales(
    settings: Settings, pares: tuple[tuple[str, str], ...] | None = None
) -> dict[str, Path]:
    """Comprueba ruta y SHA-256 de cada archivo; el primero que falla termina el arranque nombrando su variable.

    Devuelve las rutas ya verificadas por nombre de variable: quien carga los modelos no vuelve a mirar ``Settings``.
    """
    rutas: dict[str, Path] = {}
    for variable_ruta, variable_sha in pares or archivos_a_verificar(settings):
        ruta = getattr(settings, variable_ruta.lower())
        verificar_modelo(variable_ruta, variable_sha, ruta, getattr(settings, variable_sha.lower()))
        rutas[variable_ruta] = ruta
    return rutas


def _cargar_modelo(
    settings: Settings,
    rutas: dict[str, Path],
    prefijo: str,
    fabricar_sesion: Callable[..., SesionDeInferencia],
    fabricar_tokenizador: Callable[[Path], Tokenizador],
) -> tuple[SesionDeInferencia, Tokenizador]:
    """Tokenizer y sesión de un modelo (``EMBEDDING``, ``RERANKER`` o ``NLI``); el relleno sale de su tokenizer.

    La sesión se crea desde los bytes recién hasheados (no desde la ruta) y estos se sueltan al terminar.
    """
    variable_tokenizer, variable_modelo = f"{prefijo}_TOKENIZER_PATH", f"{prefijo}_MODEL_PATH"
    tokenizador = _construir(
        variable_tokenizer, lambda: fabricar_tokenizador(rutas[variable_tokenizer])
    )
    variable_sha = f"{prefijo}_MODEL_SHA256"
    contenido = leer_modelo_verificado(
        variable_modelo,
        variable_sha,
        rutas[variable_modelo],
        getattr(settings, variable_sha.lower()),
    )
    opciones: dict[str, object] = {
        "hilos": settings.model_intra_op_threads,
        "id_relleno": tokenizador.id_relleno,
    }
    variable_de_datos = PAR_DE_DATOS_EXTERNOS_DEL_NLI[0] if prefijo == "NLI" else None
    if variable_de_datos in rutas:
        opciones["datos_externos"] = _datos_externos_verificados_del_nli(settings, rutas)
    sesion = _construir(
        variable_modelo,
        lambda: fabricar_sesion(contenido, **opciones),
        variable_si_faltan_datos_externos=variable_de_datos,
    )
    return sesion, tokenizador


def _datos_externos_verificados_del_nli(
    settings: Settings, rutas: dict[str, Path]
) -> dict[str, bytes]:
    """Los bytes del ``.onnx.data`` ya hasheados, por el nombre con que el ONNX los referencia."""
    ruta = rutas[PAR_DE_DATOS_EXTERNOS_DEL_NLI[0]]
    contenido = leer_modelo_verificado(
        *PAR_DE_DATOS_EXTERNOS_DEL_NLI, ruta, settings.nli_model_data_sha256
    )
    return {ruta.name: contenido}


def _indices_de_clase_del_nli(settings: Settings) -> IndicesDeClase:
    """Columnas de entailment/neutral/contradiction de la configuración versionada, validadas ANTES de cargar nada.

    Nunca se leen del ``config.json`` del modelo: un mapeo alterado invertiría el soporte (RN-01). El error nombra la
    variable infractora y jamás su valor.
    """
    valores = {clase: getattr(settings, f"nli_label_index_{clase}") for clase in ETIQUETAS_NLI}
    for clase, valor in valores.items():
        if valor is None:
            raise ModeloNoVerificadoError(f"NLI_LABEL_INDEX_{clase.upper()}") from None
    try:
        return validar_indices_de_clase(IndicesDeClase(**valores))
    except IndicesDeClaseInvalidos as error:
        raise ModeloNoVerificadoError(f"NLI_LABEL_INDEX_{error.clase.upper()}") from None


def _comprobar_las_tres_clases_del_nli(clasificador: ClasificadorNliMdeberta) -> None:
    """Una pasada de prueba: un modelo cuya salida no tiene tres clases no puede usar los índices configurados."""
    try:
        clasificador.comprobar_salida()
    except SalidaConClasesInesperadas:
        raise ModeloNoVerificadoError("NLI_LABEL_INDEX_ENTAILMENT") from None
    except Exception:  # noqa: BLE001 - el mensaje del runtime puede llevar texto o rutas
        raise ModeloNoVerificadoError("NLI_MODEL_PATH") from None


def _exigir_configuracion_de_modelos(settings: Settings) -> ConfigModelos:
    """Sin las claves de ADR-39 no hay modelo, revisión ni dimensión que declarar: el arranque se niega."""
    if settings.modelos is None:
        raise ModeloNoVerificadoError("EMBEDDING_MODEL") from None
    return settings.modelos


def _construir[T](
    variable_ruta: str,
    construir: Callable[[], T],
    *,
    variable_si_faltan_datos_externos: str | None = None,
) -> T:
    """Un archivo corrupto o ilegible termina el arranque nombrando su variable; el motivo (con la ruta) no sale.

    Un ONNX que referencia datos externos sin resolver nombra la variable de esos datos, si el modelo la tiene.
    """
    try:
        return construir()
    except ModeloNoVerificadoError:
        raise
    except DatosExternosNoResueltos:
        raise ModeloNoVerificadoError(variable_si_faltan_datos_externos or variable_ruta) from None
    except Exception:  # noqa: BLE001 - el mensaje del runtime puede llevar la ruta
        raise ModeloNoVerificadoError(variable_ruta) from None
