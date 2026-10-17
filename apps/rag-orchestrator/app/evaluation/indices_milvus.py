"""Comparación de índices vectoriales (T5): FLAT frente a HNSW en una colección de prueba TEMPORAL de Milvus.

Nunca toca ``corpus_chunks``: el nombre de la colección lleva un prefijo propio y se elimina al terminar, incluso
si hay un error. El generador de ids y el reloj se inyectan (tests deterministas). El puerto ``ComparadorIndices``
permite probar la lógica con un índice falso sin Milvus.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np

PREFIJO_COLECCION = "adr39_tmp_"
COLECCION_DE_PRODUCCION = "corpus_chunks"
LOTE_INSERCION = 500


class ColeccionProhibida(RuntimeError):
    """El nombre pedido no es el de una colección temporal de ADR-39."""


@dataclass(frozen=True)
class ResultadoIndice:
    tipo: str
    parametros: dict[str, Any]
    top_ids: list[list[int]]  # por consulta, ids de chunk ordenados
    top_puntajes: list[list[float]]
    latencias_ms: list[float]


class ComparadorIndices(Protocol):
    def evaluar(
        self, vectores: np.ndarray, consultas: np.ndarray, tipo: str, parametros: dict[str, Any], k: int
    ) -> ResultadoIndice:
        """Crea el índice sobre ``vectores``, busca cada consulta (una por llamada) y devuelve ids, puntajes y latencias."""
        ...


def nombre_temporal(generar_id: Callable[[], str]) -> str:
    nombre = f"{PREFIJO_COLECCION}{generar_id()}"
    verificar_nombre_temporal(nombre)
    return nombre


def verificar_nombre_temporal(nombre: str) -> None:
    if nombre == COLECCION_DE_PRODUCCION or not nombre.startswith(PREFIJO_COLECCION):
        raise ColeccionProhibida(f"{nombre!r}: T5 solo usa colecciones {PREFIJO_COLECCION}* y nunca {COLECCION_DE_PRODUCCION}")


def recall_frente_a_flat(candidato: Sequence[Sequence[int]], exacto: Sequence[Sequence[int]], k: int) -> float:
    """Fracción media de los k vecinos exactos (FLAT) que recupera el índice aproximado."""
    aciertos = [len(set(c[:k]) & set(e[:k])) / max(len(e[:k]), 1) for c, e in zip(candidato, exacto)]
    return float(np.mean(aciertos))


def estimar_bytes_indice(tipo: str, parametros: dict[str, Any], numero_vectores: int, dimension: int) -> int:
    """Memoria estimada del índice en Milvus: vectores fp32 (+ enlaces del grafo en HNSW). No es una medición del servidor."""
    base = numero_vectores * dimension * 4
    if tipo == "HNSW":
        enlaces = int(parametros.get("M", 16))
        return base + numero_vectores * enlaces * 2 * 4
    return base


class ComparadorMilvus:
    """Implementación sobre ``pymilvus.MilvusClient`` (Milvus standalone de prueba)."""

    def __init__(self, uri: str, generar_id: Callable[[], str], reloj: Callable[[], float]) -> None:
        from pymilvus import MilvusClient

        self._cliente = MilvusClient(uri=uri)
        self._generar_id = generar_id
        self._reloj = reloj

    def evaluar(
        self, vectores: np.ndarray, consultas: np.ndarray, tipo: str, parametros: dict[str, Any], k: int
    ) -> ResultadoIndice:
        from pymilvus import DataType

        nombre = nombre_temporal(self._generar_id)
        cliente = self._cliente
        try:
            esquema = cliente.create_schema(auto_id=False, enable_dynamic_field=False)
            esquema.add_field("id", DataType.INT64, is_primary=True)
            esquema.add_field("dense_vector", DataType.FLOAT_VECTOR, dim=int(vectores.shape[1]))
            cliente.create_collection(nombre, schema=esquema)
            for inicio in range(0, len(vectores), LOTE_INSERCION):
                filas = [{"id": int(i), "dense_vector": vectores[i].tolist()} for i in range(inicio, min(inicio + LOTE_INSERCION, len(vectores)))]
                cliente.insert(nombre, filas)
            cliente.flush(nombre)
            indices = cliente.prepare_index_params()
            indices.add_index(field_name="dense_vector", index_type=tipo, metric_type="COSINE", params=parametros.get("construccion", {}))
            cliente.create_index(nombre, indices)
            cliente.load_collection(nombre)
            busqueda = {"metric_type": "COSINE", "params": parametros.get("busqueda", {})}
            ids: list[list[int]] = []
            puntajes: list[list[float]] = []
            latencias: list[float] = []
            for consulta in consultas:
                inicio_t = self._reloj()
                resultado = cliente.search(nombre, data=[consulta.tolist()], limit=k, search_params=busqueda, anns_field="dense_vector")
                latencias.append((self._reloj() - inicio_t) * 1000.0)
                ids.append([int(r["id"]) for r in resultado[0]])
                puntajes.append([float(r["distance"]) for r in resultado[0]])
            return ResultadoIndice(tipo, parametros, ids, puntajes, latencias)
        finally:
            if cliente.has_collection(nombre):
                cliente.drop_collection(nombre)
