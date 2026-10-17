"""Envoltorios de MEDICIÓN de los modelos de ADR-39 sobre ONNX Runtime (CPU).

No son los adapters de producción de US-055 (``infrastructure/embeddings|reranker|nli``): no adelantan su
diseño. Este módulo no importa ``torch`` ni ``transformers`` para que el RSS medido sea el de la inferencia.
Los puertos (``Embedder``, ``Reranker``, ``ClasificadorNli``) permiten usar modelos falsos en las pruebas.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Protocol

import numpy as np

from app.evaluation.config_medicion import ModeloSpec

TAMANO_LOTE_TOKENS = 4096  # presupuesto de tokens por llamada a ONNX Runtime al codificar el corpus


MENSAJE_LISTA_VACIA = "la lista de entrada está vacía"


class Embedder(Protocol):
    def codificar(self, textos: list[str], *, consulta: bool) -> np.ndarray:
        """Vectores L2-normalizados, una fila por texto. Contrato: ``textos`` vacío lanza ``ValueError`` (los fakes también)."""
        ...


class Reranker(Protocol):
    def puntuar(self, consulta: str, pasajes: list[str]) -> list[float]:
        """Puntaje crudo por pasaje (mayor = más relevante). Contrato: ``pasajes`` vacío lanza ``ValueError``."""
        ...


class ClasificadorNli(Protocol):
    def clasificar(self, pares: list[tuple[str, str]]) -> list[str]:
        """Etiqueta (entailment | neutral | contradiction) por par (fragmento, afirmación). Contrato: ``pares`` vacío lanza ``ValueError``."""
        ...


class MonitorRss:
    """Muestrea el RSS del proceso en un hilo y guarda el máximo (MB)."""

    def __init__(self, intervalo_s: float = 0.02) -> None:
        import psutil

        self._proceso = psutil.Process()
        self._intervalo = intervalo_s
        self._parar = threading.Event()
        self._hilo = threading.Thread(target=self._muestrear, daemon=True)
        self.maximo_mb = self.actual_mb()

    def actual_mb(self) -> float:
        return self._proceso.memory_info().rss / 2**20

    def _muestrear(self) -> None:
        while not self._parar.is_set():
            self.maximo_mb = max(self.maximo_mb, self.actual_mb())
            time.sleep(self._intervalo)

    def __enter__(self) -> MonitorRss:
        self._hilo.start()
        return self

    def __exit__(self, *_: object) -> None:
        self._parar.set()
        self._hilo.join()
        self.maximo_mb = max(self.maximo_mb, self.actual_mb())


def pico_rss_mb() -> float:
    """RSS máximo histórico del proceso (incluye la carga del modelo)."""
    import resource
    import sys

    maximo = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return maximo / 2**20 if sys.platform == "darwin" else maximo / 1024


class _ModeloOnnx:
    """Sesión de ONNX Runtime + tokenizador rápido de un candidato ya exportado."""

    def __init__(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> None:
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.spec = spec
        opciones = ort.SessionOptions()
        opciones.intra_op_num_threads = hilos
        opciones.inter_op_num_threads = 1
        self.sesion = ort.InferenceSession(
            str(directorio / cuantizacion / "model.onnx"),
            sess_options=opciones,
            providers=["CPUExecutionProvider"],
        )
        self.tokenizador = Tokenizer.from_file(str(directorio / "tokenizer.json"))
        self.tokenizador.no_truncation()
        self.tokenizador.no_padding()
        config = json.loads((directorio / "config.json").read_text(encoding="utf-8"))
        self.id_relleno = int(config.get("pad_token_id") or 0)
        self.registro = json.loads((directorio / "export.json").read_text(encoding="utf-8"))

    def _correr(self, secuencias: list[list[int]]) -> np.ndarray:
        largo = max(len(s) for s in secuencias)
        ids = np.full((len(secuencias), largo), self.id_relleno, dtype=np.int64)
        mascara = np.zeros((len(secuencias), largo), dtype=np.int64)
        for i, s in enumerate(secuencias):
            ids[i, : len(s)] = s
            mascara[i, : len(s)] = 1
        return np.asarray(self.sesion.run(None, {"input_ids": ids, "attention_mask": mascara})[0])


class EmbedderOnnx(_ModeloOnnx):
    def __init__(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> None:
        super().__init__(spec, directorio, cuantizacion, hilos)
        self._pesos_sparse = None
        ruta = directorio / "sparse_linear.npz"
        if ruta.exists():
            datos = np.load(ruta)
            self._pesos_sparse = (datos["weight"], datos["bias"])

    def contar_tokens(self, texto: str) -> int:
        return len(self.tokenizador.encode(texto, add_special_tokens=False).ids)

    def _ids(self, texto: str) -> list[int]:
        ids = self.tokenizador.encode(texto).ids
        if len(ids) > self.spec.max_length:
            ids = (
                ids[: self.spec.max_length - 1] + ids[-1:]
                if self.spec.pooling == "ultimo_token"
                else ids[: self.spec.max_length]
            )
        return ids

    def _pool(self, oculto: np.ndarray, longitudes: list[int]) -> np.ndarray:
        if self.spec.pooling == "cls":
            vectores = oculto[:, 0]
        elif self.spec.pooling == "ultimo_token":
            vectores = oculto[np.arange(len(longitudes)), np.array(longitudes) - 1]
        else:  # media sobre tokens reales
            mascara = (np.arange(oculto.shape[1])[None, :] < np.array(longitudes)[:, None])[
                ..., None
            ]
            vectores = (oculto * mascara).sum(1) / np.array(longitudes)[:, None]
        if self.spec.dim_salida:
            vectores = vectores[:, : self.spec.dim_salida]
        normas = np.linalg.norm(vectores, axis=1, keepdims=True)
        return (vectores / np.maximum(normas, 1e-12)).astype(np.float32)

    def codificar(self, textos: list[str], *, consulta: bool) -> np.ndarray:
        if not textos:
            raise ValueError(MENSAJE_LISTA_VACIA)
        plantilla = self.spec.plantilla_consulta if consulta else self.spec.plantilla_documento
        secuencias = [self._ids(plantilla.format(texto=t)) for t in textos]
        orden = sorted(range(len(secuencias)), key=lambda i: len(secuencias[i]))
        salida: list[np.ndarray | None] = [None] * len(secuencias)
        lote: list[int] = []
        for i in orden:
            if lote and (len(lote) + 1) * len(secuencias[i]) > TAMANO_LOTE_TOKENS:
                self._llenar(lote, secuencias, salida)
                lote = []
            lote.append(i)
        if lote:
            self._llenar(lote, secuencias, salida)
        return np.stack([v for v in salida if v is not None])

    def _llenar(
        self, lote: list[int], secuencias: list[list[int]], salida: list[np.ndarray | None]
    ) -> None:
        oculto = self._correr([secuencias[i] for i in lote])
        vectores = self._pool(oculto, [len(secuencias[i]) for i in lote])
        for fila, i in enumerate(lote):
            salida[i] = vectores[fila]

    def pesos_sparse(self, texto: str) -> dict[int, float]:
        """Pesos léxicos del modelo (``relu(sparse_linear(h))`` por token, máximo por token); solo BGE-M3 (D5)."""
        if self._pesos_sparse is None:
            raise RuntimeError("el modelo no trae sparse nativo")
        ids = self._ids(texto)
        oculto = self._correr([ids])[0]
        pesos = np.maximum(oculto @ self._pesos_sparse[0].T + self._pesos_sparse[1], 0).reshape(-1)
        especiales = {ids[0], ids[-1]}
        resultado: dict[int, float] = {}
        for token, peso in zip(ids, pesos):
            if token not in especiales and peso > 0:
                resultado[token] = max(resultado.get(token, 0.0), float(peso))
        return resultado


class RerankerOnnx(_ModeloOnnx):
    PREFIJO = (
        "<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct "
        'provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n'
    )
    SUFIJO = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"

    def __init__(
        self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int, max_length: int
    ) -> None:
        super().__init__(spec, directorio, cuantizacion, hilos)
        self.max_length = max_length
        self._prefijo = self.tokenizador.encode(self.PREFIJO, add_special_tokens=False).ids
        self._sufijo = self.tokenizador.encode(self.SUFIJO, add_special_tokens=False).ids

    def _secuencia_par(self, consulta: str, pasaje: str) -> list[int]:
        if self.spec.tarea == "reranker_causal":
            contenido = (
                f"<Instruct>: {self.spec.instruccion}\n<Query>: {consulta}\n<Document>: {pasaje}"
            )
            ids = self.tokenizador.encode(contenido, add_special_tokens=False).ids
            return (
                self._prefijo
                + ids[: self.max_length - len(self._prefijo) - len(self._sufijo)]
                + self._sufijo
            )
        ids_consulta = self.tokenizador.encode(consulta).ids
        ids_par = self.tokenizador.encode(consulta, pasaje).ids
        if len(ids_par) <= self.max_length:
            return ids_par
        # truncado del segundo segmento (el pasaje), conservando el separador final del par
        return (
            ids_par[: self.max_length - 1] + ids_par[-1:]
            if len(ids_consulta) < self.max_length - 1
            else ids_par[: self.max_length]
        )

    def puntuar(self, consulta: str, pasajes: list[str]) -> list[float]:
        if not pasajes:
            raise ValueError(MENSAJE_LISTA_VACIA)
        salida = self._correr([self._secuencia_par(consulta, p) for p in pasajes])
        if self.spec.tarea == "reranker_causal":
            return [float(v) for v in salida[:, 1] - salida[:, 0]]  # logit(yes) - logit(no)
        return [float(v) for v in salida[:, 0]]


class TokenizadorModelo:
    """Tokenizador del modelo elegido para medir el tamaño de chunk en sus tokens (puerto ``Tokenizador``)."""

    def __init__(self, directorio: Path, max_length: int) -> None:
        from tokenizers import Tokenizer

        self._tokenizador = Tokenizer.from_file(str(directorio / "tokenizer.json"))
        self._tokenizador.no_truncation()
        self._tokenizador.no_padding()
        self.max_length = max_length
        con = len(self._tokenizador.encode("x").ids)
        sin = len(self._tokenizador.encode("x", add_special_tokens=False).ids)
        self.tokens_especiales = con - sin

    def desplazamientos(self, texto: str) -> list[tuple[int, int]]:
        return [
            (inicio, fin)
            for inicio, fin in self._tokenizador.encode(texto, add_special_tokens=False).offsets
        ]


class NliOnnx(_ModeloOnnx):
    def __init__(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> None:
        super().__init__(spec, directorio, cuantizacion, hilos)
        config = json.loads((directorio / "config.json").read_text(encoding="utf-8"))
        self.etiquetas = {int(k): str(v).lower() for k, v in config["id2label"].items()}

    def clasificar(self, pares: list[tuple[str, str]]) -> list[str]:
        if not pares:
            raise ValueError(MENSAJE_LISTA_VACIA)
        secuencias = []
        for fragmento, afirmacion in pares:
            ids = self.tokenizador.encode(fragmento, afirmacion).ids
            secuencias.append(
                ids[: self.spec.max_length - 1] + ids[-1:]
                if len(ids) > self.spec.max_length
                else ids
            )
        logits = self._correr(secuencias)
        return [self.etiquetas[int(i)] for i in logits.argmax(axis=1)]
