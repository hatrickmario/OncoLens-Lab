"""Constructor del conjunto dorado de población y de su configuración para las pruebas de la familia `poblacion`
(L1D-299). Texto 100 % sintético (RN-13, RN-14, RN-21): lo que se mide es la orquestación, no el contenido."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import yaml

from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO

CATALOGO_DE_REGLAS = "apps/rag-orchestrator/tests/fixtures/catalogo/test-apl-1.2.0"
REVISOR = {"rol": "oncologo_revisor", "fecha": "2026-10-31"}

DOCUMENTOS: dict[str, Any] = {
    "doc-t1": {
        "estrato": "ensayo",
        "idioma": "en",
        "tipo_de_cancer": "mama",
        "fragmentos": [
            {
                "chunk_id": "ch-t1-1",
                "texto": "Eligibility: premenopausal or postmenopausal women with HER2-positive early breast cancer.",
            },
            {
                "chunk_id": "ch-t1-2",
                "texto": "Results: in the triple-negative subgroup the effect was similar to the full population.",
            },
        ],
    },
    "doc-t2": {
        "estrato": "guia",
        "idioma": "es",
        "tipo_de_cancer": "mama",
        "fragmentos": [
            {
                "chunk_id": "ch-t2-1",
                "texto": "Poblacion: mujeres posmenopausicas con cancer de mama metastasico en primera linea.",
            }
        ],
    },
}

PARES: list[dict[str, Any]] = [
    {
        "id": "t1-menopausia",
        "documento": "doc-t1",
        "criterio": "estado_menopausico",
        "esperados": [
            {"valor": "premenopausal women", "scope": "elegibilidad", "chunk": "ch-t1-1"},
            {"valor": "postmenopausal women", "scope": "elegibilidad", "chunk": "ch-t1-1"},
        ],
    },
    {
        "id": "t1-her2",
        "documento": "doc-t1",
        "criterio": "estado_her2",
        "esperados": [{"valor": "HER2-positive", "scope": "elegibilidad", "chunk": "ch-t1-1"}],
    },
    {
        "id": "t1-receptores",
        "documento": "doc-t1",
        "criterio": "receptores_hormonales",
        "esperados": [{"valor": "triple-negative", "scope": "subgrupo", "chunk": "ch-t1-2"}],
    },
    {
        "id": "t2-linea",
        "documento": "doc-t2",
        "criterio": "linea_tratamiento",
        "esperados": [{"valor": "first line", "scope": "elegibilidad", "chunk": "ch-t2-1"}],
    },
]

# F-20…F-24 (DEC-11): el estado lo fija un humano leyendo la regla, no la salida del código.
ESTADOS: list[dict[str, Any]] = [
    {
        "id": "F-20",
        "criterio": "estado_menopausico",
        "tipo_de_cancer": "mama",
        "paciente": "posmenopáusica",
        "valores": [
            {"valor": "premenopausal women", "scope": "elegibilidad", "chunk": "ch-a"},
            {"valor": "postmenopausal women", "scope": "elegibilidad", "chunk": "ch-a"},
        ],
        "esperado": {"estado": "parcial"},
    },
    {
        "id": "F-21",
        "criterio": "estado_menopausico",
        "tipo_de_cancer": "mama",
        "paciente": "premenopáusica",
        "valores": [{"valor": "postmenopausal women", "scope": "elegibilidad", "chunk": "ch-a"}],
        "esperado": {"estado": "desconocido"},
    },
    {
        "id": "F-21b",
        "criterio": "estado_menopausico",
        "tipo_de_cancer": "mama",
        "paciente": "premenopáusica",
        "valores": [
            {"valor": "only postmenopausal women", "scope": "elegibilidad", "chunk": "ch-a"}
        ],
        "esperado": {"estado": "no_coincide"},
    },
    {
        "id": "F-22",
        "criterio": "estado_menopausico",
        "tipo_de_cancer": "mama",
        "paciente": "posmenopáusica",
        "valores": [
            {"valor": "premenopausal women", "scope": "elegibilidad", "chunk": "ch-a"},
            {"valor": "postmenopausal women", "scope": "elegibilidad", "chunk": "ch-b"},
        ],
        "citados": ["ch-b"],
        "esperado": {"estado": "coincide"},
    },
    {
        "id": "F-23",
        "criterio": "estado_her2",
        "tipo_de_cancer": "mama",
        "paciente": "3+",
        "valores": [
            {"valor": "HER2-positive (IHC 3+)", "scope": "elegibilidad", "chunk": "ch-a"},
            {
                "valor": "HER2-negative (IHC 2+, ISH not amplified)",
                "scope": "elegibilidad",
                "chunk": "ch-b",
            },
        ],
        "esperado": {"estado": "desconocido"},
    },
]


def _escribir_yaml(ruta: Path, contenido: Any) -> None:
    ruta.write_text(
        yaml.safe_dump(contenido, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )


def pares_del_bucle(cantidad: int, cortes: int = 0) -> dict[str, Any]:
    """``cantidad`` pares pregunta + fuente; los primeros ``cortes`` fuerzan ``finish_reason = length``."""
    return {
        "pares": [
            {
                "id": f"b{i:02d}",
                "pregunta": f"Pregunta sintetica {i} sobre una poblacion de ensayo",
                "fuentes": [
                    {
                        "documento": f"doc-b{i:02d}",
                        "fragmentos": [
                            {
                                "chunk_id": f"ch-b{i:02d}-1",
                                "texto": f"Eligibility: women with HER2-positive disease, cohort {i}.",
                            }
                        ],
                        "corte": 2 if i < cortes else 0,
                    }
                ],
            }
            for i in range(cantidad)
        ]
    }


def escribir_dorado(
    destino: Path,
    *,
    revisor: dict[str, str] | None = REVISOR,
    licencia: str | None = "sintetico_propio",
    pares: list[dict[str, Any]] | None = None,
    estados: list[dict[str, Any]] | None = None,
    bucle: dict[str, Any] | None = None,
    clase: str = "sintetico",
) -> Path:
    destino.mkdir(parents=True, exist_ok=True)
    manifiesto: dict[str, Any] = {
        "clase": clase,
        "nombre": "poblacion-dorado-de-prueba",
        "version": "1",
        "catalogos": {"mama": CATALOGO_DE_REGLAS},
        "licencias": {} if licencia is None else {d: licencia for d in DOCUMENTOS},
    }
    if revisor is not None:
        manifiesto["revisor"] = revisor
    (destino / "manifest.json").write_text(json.dumps(manifiesto), encoding="utf-8")
    _escribir_yaml(
        destino / "pares.yaml",
        {"documentos": DOCUMENTOS, "pares": copy.deepcopy(PARES if pares is None else pares)},
    )
    _escribir_yaml(destino / "estados.yaml", {"casos": ESTADOS if estados is None else estados})
    _escribir_yaml(destino / "pares-bucle.yaml", pares_del_bucle(20) if bucle is None else bucle)
    return destino


def escribir_config(destino: Path, dataset: Path, **cambios: Any) -> Path:
    """Configuración de la familia con adapters falsos; ``cambios`` sustituye secciones enteras (p. ej. ``metas``)."""
    crudo: dict[str, Any] = {
        "nombre": "test-poblacion",
        "fixture": "FX-06c-d",
        "dataset": {"ruta": str(dataset)},
        "medicion": {"reloj": "simulado"},
        "adaptadores": {"proveedor": "fake"},
        "umbrales": {"nli_entailment_threshold": 0.8},
        "catalogo": {"ruta": "packages/clinical-catalogs"},
        "extraccion": {
            "top_k": 2,
            "max_valores_por_criterio": 3,
            "max_tokens_de_salida": 256,
            "concurrencia": 2,
            "reintentos": 1,
        },
        "licencias_aceptadas": ["cc_by", "cc_by_sa", "dominio_publico", "sintetico_propio"],
        "metas": {
            "precision": {"minimo": 0.9},
            "cobertura": {"minimo": 0.8},
            "concordancia": {"minimo": 1.0},
            "tasa_duplicados": {"maximo": 0.0},
        },
        "dorado": {"minimo_de_pares": 4},
        "bucle": {"minimo_de_pares": 20},
        "sin_evidencia": {
            "config": str(RAIZ_APP / "eval" / "configs" / "test-fake.yaml"),
            "baseline": str(RAIZ_REPO / "data" / "evaluation" / "baseline.json"),
        },
    }
    crudo.update(cambios)
    ruta = destino / "config-poblacion.yaml"
    _escribir_yaml(ruta, crudo)
    return ruta
