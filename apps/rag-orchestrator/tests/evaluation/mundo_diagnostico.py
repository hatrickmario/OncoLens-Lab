"""Mundo de prueba de la familia `diagnostico` (US-276): un corpus y unos pares sintéticos en un directorio temporal y
puertos guionados (búsqueda, reranker, NLI) que cumplen el contrato de los puertos reales. Cada redacción declara qué ve
cada etapa, así que cada pérdida del fixture es una etapa conocida. Sin mocks de módulos propios."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

import yaml

from app.application.ports import CandidatoParaReranker, ChunkEncontrado
from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.adaptadores_falsos import EmbedderBolsaDePalabras, GeneradorGuionado, tokens
from app.evaluation.composicion_suite import Adaptadores
from app.evaluation.corrida_diagnostico import PuertosDeDiagnostico
from app.evaluation.dataset_loader import Evidencia, Pregunta
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio, OpcionPropuesta
from app.infrastructure.fake.tarea_de_poblacion_silenciosa import TareaDePoblacionSilenciosa
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal

TIPOS = ("coloquial_tecnico", "sin_tildes", "orden", "es_en")
DISTRACTORES = ("x1", "x2", "x3", "x4")
PUNTAJE_POR_DEFECTO = 0.05
MARCADORES_NLI = {"alfa": 0.55, "beta": 0.65, "gamma": 0.10}
"""Una hipótesis con la palabra marcada recibe ese ``p_entailment``; el resto, la regla léxica del NLI falso."""


@dataclass(frozen=True)
class Redaccion:
    """Lo que ve cada etapa con esta redacción: candidatos densos (en orden), puntajes del reranker y la propuesta."""

    candidatos: tuple[str, ...]
    puntajes: dict[str, float] = field(default_factory=dict)
    propuesta: str = "ninguna"
    """``entailed`` (soportada), ``alfa|beta|gamma`` (``p_entailment`` marcado), ``ninguna`` o ``cita_invalida``."""


@dataclass(frozen=True)
class ParDePrueba:
    id: str
    tipo: str
    a: Redaccion
    b: Redaccion


def esperado(i: int) -> str:
    return f"e{i}"


def cita_de(i: int) -> str:
    return f"hallazgo descrito del fragmento {i}"


def con_evidencia(i: int) -> Redaccion:
    """El chunk esperado es el primer candidato, entra en los pares, supera el umbral y su opción pasa el soporte."""
    return Redaccion((esperado(i), *DISTRACTORES), {esperado(i): 0.9}, propuesta="entailed")


def par_de_cada_etapa() -> tuple[ParDePrueba, ...]:
    """Siete pares: uno que pierde en cada etapa, dos ``sin_asignar``, uno sin pérdida (``top_k`` 4, 2 pares al reranker)."""
    e = esperado
    return (
        ParDePrueba(
            "P1", TIPOS[0], con_evidencia(1), Redaccion(DISTRACTORES, {})
        ),  # recuperacion_densa
        ParDePrueba(
            "P2", TIPOS[1], con_evidencia(2), Redaccion(("x1", "x2", e(2), "x3"), {e(2): 0.9})
        ),  # corte_de_pares: puesto 3, solo caben 2
        ParDePrueba(
            "P3", TIPOS[2], con_evidencia(3), Redaccion((e(3), *DISTRACTORES), {e(3): 0.2})
        ),  # umbral_de_relevancia
        ParDePrueba(
            "P4",
            TIPOS[3],
            con_evidencia(4),
            Redaccion((e(4), *DISTRACTORES), {e(4): 0.9}, propuesta="gamma"),
        ),  # nli
        ParDePrueba(
            "P5",
            TIPOS[0],
            con_evidencia(5),
            Redaccion((e(5), *DISTRACTORES), {e(5): 0.9}, propuesta="ninguna"),
        ),  # sin_asignar: sin_opciones_generadas
        ParDePrueba(
            "P6",
            TIPOS[1],
            con_evidencia(6),
            Redaccion((e(6), *DISTRACTORES), {e(6): 0.9}, propuesta="cita_invalida"),
        ),  # sin_asignar: citas
        ParDePrueba("P7", TIPOS[2], con_evidencia(7), con_evidencia(7)),  # sin pérdida
    )


# --- puertos guionados -----------------------------------------------------------------------------------------------


class BuscadorGuionado:
    """``ChunkSearch`` que devuelve, para cada redacción y en orden, sus candidatos. El servicio busca dos veces por
    consulta (la pregunta y el resumen del contexto): cada par de llamadas consume una redacción."""

    def __init__(
        self, redacciones: Sequence[Redaccion], chunks: dict[str, tuple[str, str]]
    ) -> None:
        self._redacciones = list(redacciones)
        self._chunks = chunks
        self.llamadas = 0

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        """Respeta ``limit`` como el puerto real (Milvus devuelve a lo sumo ``limit`` resultados)."""
        redaccion = self._redacciones[self.llamadas // 2]
        self.llamadas += 1
        return [
            ChunkEncontrado(chunk, self._chunks[chunk][0], self._chunks[chunk][1], 1.0 - 0.1 * i)
            for i, chunk in enumerate(redaccion.candidatos[:limit])
        ]


class RerankerGuionado:
    """``Reranker``: el puntaje de cada candidato sale de la redacción que se está consultando (``null`` ≠ ``0.0``: nunca
    devuelve ``None``; un candidato sin puntaje guionado recibe un valor bajo)."""

    version = "fake-reranker-guionado@1"

    def __init__(self, puntajes_por_pregunta: dict[str, dict[str, float]]) -> None:
        self._puntajes = puntajes_por_pregunta

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        guion = self._puntajes.get(
            pregunta, {}
        )  # una pregunta sin guion recibe el puntaje por defecto, no un KeyError
        return [guion.get(c.chunk_id, PUNTAJE_POR_DEFECTO) for c in candidatos]


class NliPorMarcador:
    version = "fake-nli-marcador@1"

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        return [self._resultado(p) for p in pares]

    @staticmethod
    def _resultado(par: ParNli) -> ResultadoNli:
        marcado = next(
            (p for palabra, p in MARCADORES_NLI.items() if palabra in par.hipotesis.lower()), None
        )
        p = marcado if marcado is not None else _lexico(par)
        return ResultadoNli(label="entailment" if p > 0.5 else "neutral", p_entailment=p)


def _lexico(par: ParNli) -> float:
    return 0.97 if tokens(par.hipotesis) <= tokens(par.premisa) else 0.02


# --- el mundo en disco -----------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Mundo:
    config: Path
    pares: Path
    corpus: Path
    puertos: PuertosDeDiagnostico
    textos: tuple[str, ...]
    """Todo texto que el informe jamás debe contener: preguntas, chunks y propuestas."""


def _yaml(ruta: Path, contenido: dict[str, Any]) -> None:
    ruta.write_text(
        yaml.safe_dump(contenido, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )


def _texto_de_chunk(i: int) -> str:
    return f"Resumen sintetico: el {cita_de(i)} aparece en este pasaje del documento."


def _escribir_corpus(directorio: Path, cantidad: int) -> dict[str, tuple[str, str]]:
    directorio.mkdir(parents=True)
    documentos = [
        {"id": f"d{i}", "titulo": f"Documento {i} (test)", "cancer": "mama"}
        for i in range(1, cantidad + 1)
    ]
    documentos.append({"id": "dx", "titulo": "Relleno (test)", "cancer": "mama"})
    chunks = [
        {"id": esperado(i), "documento": f"d{i}", "texto": _texto_de_chunk(i)}
        for i in range(1, cantidad + 1)
    ]
    chunks += [
        {
            "id": x,
            "documento": "dx",
            "texto": f"Texto sintetico de relleno numero {x} sin relacion alguna.",
        }
        for x in DISTRACTORES
    ]
    _yaml(
        directorio / "manifest.yaml",
        {"clase": "sintetico", "nombre": "corpus-diagnostico-prueba", "version": "1"},
    )
    _yaml(
        directorio / "corpus.yaml",
        {
            "clase": "sintetico",
            "release": "rel-prueba-1",
            "corte": "2026-11-03",
            "documentos": documentos,
            "chunks": chunks,
        },
    )
    _yaml(
        directorio / "preguntas.yaml",
        {
            "clase": "sintetico",
            "preguntas": [
                {
                    "id": "Q0",
                    "idioma": "es",
                    "cancer": "mama",
                    "tipo": "hecho",
                    "modo_acierto": "cualquiera",
                    "pregunta": "Pregunta de relleno del corpus",
                    "evidencia": [{"documento": "d1", "cita": cita_de(1)}],
                }
            ],
        },
    )
    _yaml(directorio / "propuestas.yaml", {"clase": "sintetico", "propuestas": {}})
    _yaml(directorio / "pii.yaml", {"clase": "sintetico", "textos": []})
    _yaml(directorio / "prescriptivas.yaml", {"clase": "sintetico", "salidas": []})
    return {c["id"]: (c["documento"], c["texto"]) for c in chunks}


def _pregunta(par: ParDePrueba, redaccion_id: str, indice: int) -> str:
    return f"¿Qué describe la evidencia del tema {par.id} en su redacción {redaccion_id} número {indice}?"


def _propuestas(par: ParDePrueba, redaccion: Redaccion, i: int) -> tuple[OpcionPropuesta, ...]:
    justificacion = {
        "entailed": cita_de(i),
        "alfa": f"alfa {cita_de(i)}",
        "beta": f"beta {cita_de(i)}",
        "gamma": f"gamma {cita_de(i)}",
        "cita_invalida": cita_de(i),
        "ninguna": "",
    }[redaccion.propuesta]
    if redaccion.propuesta == "ninguna":
        return ()
    citas = ("ch-que-no-existe",) if redaccion.propuesta == "cita_invalida" else (esperado(i),)
    return (OpcionPropuesta(f"Opción descrita {par.id}", justificacion, citas),)


def construir_mundo(
    tmp_path: Path,
    pares: Sequence[ParDePrueba],
    *,
    clase: str = "sintetico",
    cita_en_el_corpus: bool = True,
    ajustes_de_config: dict[str, Any] | None = None,
) -> Mundo:
    chunks = _escribir_corpus(tmp_path / "corpus", len(pares))
    directorio = tmp_path / "pares"
    directorio.mkdir()
    _yaml(
        directorio / "manifest.yaml",
        {
            "clase": clase,
            "nombre": "pares-prueba",
            "version": "1",
            "corpus": str(tmp_path / "corpus"),
            "archivos": {"pares": "pares.yaml"},
            "revision_provisional": {"rol": "ia", "fecha": "2026-11-22"},
        },
    )
    crudos, preguntas, propuestas, redacciones, puntajes, textos = [], [], {}, [], {}, []
    for i, par in enumerate(pares, 1):
        cita = cita_de(i) if cita_en_el_corpus else "texto que no esta en ningun fragmento"
        escritas = []
        for rid, redaccion in (("a", par.a), ("b", par.b)):
            texto = _pregunta(par, rid, i)
            escritas.append({"id": rid, "idioma": "es", "pregunta": texto})
            identificador = f"{par.id}-{rid}"
            preguntas.append(
                Pregunta(
                    id=identificador,
                    idioma="es",
                    cancer="mama",
                    tipo="parafrasis",
                    texto=texto,
                    modo_acierto="cualquiera",
                    documentos=(f"d{i}",),
                    evidencia=(Evidencia(f"d{i}", cita_de(i)),),
                )
            )
            propuestas[identificador] = _propuestas(par, redaccion, i)
            redacciones.append(redaccion)
            puntajes[texto] = redaccion.puntajes
            textos.append(texto)
        crudos.append(
            {
                "id": par.id,
                "tipo": par.tipo,
                "tipo_de_cancer": "mama",
                "redacciones": escritas,
                "evidencia": [{"documento": f"d{i}", "cita": cita}],
            }
        )
    _yaml(directorio / "pares.yaml", {"clase": clase, "pares": crudos})
    base = FuenteDatasetEnDirectorio(tmp_path / "corpus").cargar()
    guion = replace(
        base, preguntas=(*base.preguntas, *preguntas), propuestas={**base.propuestas, **propuestas}
    )
    adaptadores = Adaptadores(
        detector_idioma=DetectorDeIdiomaLocal("es"),
        embedder=EmbedderBolsaDePalabras(),
        vectores_de_chunks=[EmbedderBolsaDePalabras().embeber(c.texto) for c in base.chunks],
        reranker=RerankerGuionado(puntajes),
        generador=GeneradorGuionado(guion),
        clasificador_nli=NliPorMarcador(),
        proponente=TareaDePoblacionSilenciosa(),
    )
    config = {
        "nombre": "diagnostico-prueba",
        "fixture": "DIAG-PRUEBA",
        "dataset": {"ruta": str(directorio)},
        "semilla_bootstrap": 20261122,
        "bootstrap_repeticiones": 10,
        "medicion": {"reloj": "simulado"},
        "adaptadores": {"proveedor": "fake"},
        "modelos": {"llm": "fake-guion@1"},
        "umbrales": {
            "relevance_threshold": 0.30,
            "nli_entailment_threshold": 0.7,
            "retrieval_top_k": 4,
            "rerank_top_n": 10,
        },
        "catalogo": {"version": "2026.10.0", "ruta_terminos": "packages/clinical-catalogs"},
        "diagnostico": {
            "pares_minimos": len(pares),
            "nli_banda_inferior": 0.5,
            "nli_ancho_de_tramo": 0.1,
            "reranker_max_pairs": 2,
        },
    }
    for clave, valor in (ajustes_de_config or {}).items():
        config[clave] = {**config.get(clave, {}), **valor} if isinstance(valor, dict) else valor
    ruta = tmp_path / "config.yaml"
    _yaml(ruta, config)
    return Mundo(
        ruta,
        directorio,
        tmp_path / "corpus",
        PuertosDeDiagnostico(
            adaptadores=adaptadores,
            buscador=BuscadorGuionado(redacciones, chunks),
        ),
        tuple(textos)
        + tuple(t for _, t in chunks.values())
        + tuple(o.justificacion for ps in propuestas.values() for o in ps),
    )
