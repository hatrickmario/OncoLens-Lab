"""Constructores de datos sintéticos para las pruebas del baseline de VM-1 y VM-2."""

from __future__ import annotations

import copy
import csv
import io
import json
from pathlib import Path
from typing import Any

from app.evaluation.vm.dominio import COLUMNAS, EJES_CRITICOS, ConfigVM, Fila

FIXTURES = Path(__file__).parent / "fixtures"
CASOS = ("mama-01", "mama-02", "mama-03", "prostata-01", "prostata-02", "prostata-03")
CONFIG = ConfigVM(
    max_minutos=30,
    patron_participante=r"^O[1-9][0-9]*$",
    patron_fuente=r"^[A-Za-z0-9._:/-]{1,128}$",
)
FECHA_CORTE = "2026-06-30"


def _caso(id_caso: str) -> dict[str, Any]:
    return {
        "id": id_caso,
        "tipo_cancer": id_caso.split("-")[0],
        "documentos": [f"{id_caso}/documentos/01-informe.md"],
        "pregunta_referencia": {
            "poblacion": "Población sintética",
            "contexto_clinico": "Contexto sintético",
            "decision": "Decisión sintética",
            "fecha_corte_evidencia": FECHA_CORTE,
            "texto": f"Pregunta sintética con evidencia hasta {FECHA_CORTE}",
        },
        "checklist_reconstruccion": {
            "version": "1.0",
            "fecha_validacion_clinica": "2026-10-16",
            "criticos": [{"eje": e, "respuesta_esperada": "x"} for e in EJES_CRITICOS],
            "complementarios": [{"respuesta_esperada": "y"}],
        },
    }


def manifiesto_valido() -> dict[str, Any]:
    return {"clase": "sintetico", "casos": [_caso(c) for c in CASOS]}


def manifiesto_con(id_caso: str, **cambios: Any) -> dict[str, Any]:
    """Manifiesto válido donde ``id_caso`` recibe los cambios (claves de primer nivel del caso)."""
    manifiesto = copy.deepcopy(manifiesto_valido())
    for caso in manifiesto["casos"]:
        if caso["id"] == id_caso:
            caso.update(cambios)
    return manifiesto


def fila(**cambios: str) -> Fila:
    base = {
        "participante": "O1",
        "caso": "mama-01",
        "condicion": "manual",
        "tiempo_reconstruccion_min": "10",
        "reconstruido": "si",
        "tiempo_evidencia_min": "12",
        "autoidentificada": "si",
        "fuente_id": "PMID:1000001",
        "validada": "si",
    }
    base.update(cambios)
    return base


def csv_texto(filas: list[Fila], columnas: tuple[str, ...] = COLUMNAS) -> str:
    salida = io.StringIO()
    escritor = csv.DictWriter(salida, fieldnames=list(columnas), lineterminator="\n")
    escritor.writeheader()
    escritor.writerows(filas)
    return salida.getvalue()


def escribir_manifiesto(directorio: Path, manifiesto: dict[str, Any]) -> Path:
    """Escribe el manifiesto y un documento por cada ruta declarada, para que existan."""
    for caso in manifiesto["casos"]:
        for documento in caso.get("documentos", []):
            destino = directorio / documento
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text("# documento sintético\n", encoding="utf-8")
    ruta = directorio / "manifest.json"
    ruta.write_text(json.dumps(manifiesto, ensure_ascii=False), encoding="utf-8")
    return ruta
