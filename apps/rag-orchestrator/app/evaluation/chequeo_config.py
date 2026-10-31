"""Chequeo de configuración de ADR-39 (``adr39_measure --check-config``, US-012 AC-3, AC-10 a AC-12).

Compara ``apps/rag-orchestrator/.env.example`` con el bloque de decisión de
``docs/architecture/adr/ADR-39-modelos-locales.md`` y falla si ``EMBEDDING_DIM`` o ``SPARSE_VECTOR_SOURCE``
(o cualquier otra clave de la decisión) faltan o difieren. También comprueba que ``data-model.md`` no fije
la dimensión con un literal numérico.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from app.config.modelos import CLAVES_ADR39, ConfigInvalida, cargar_config_modelos

RUTA_ADR = Path("docs/architecture/adr/ADR-39-modelos-locales.md")
RUTA_ENV = Path("apps/rag-orchestrator/.env.example")
RUTA_MODELO_DATOS = Path("docs/architecture/data-model.md")
CLAVES_OBLIGATORIAS = ("EMBEDDING_DIM", "SPARSE_VECTOR_SOURCE")
BLOQUE = re.compile(
    r"<!-- adr39:decision:inicio -->\s*```ya?ml\n(?P<yaml>.*?)```\s*<!-- adr39:decision:fin -->",
    re.DOTALL,
)
REFERENCIA = re.compile(r"\b(?:US|ADR|RN|FR|OL|resp\.)[- ]?\d+\b")
LITERAL_NUMERICO = re.compile(r"\b\d{2,}\b")


@dataclass
class ResultadoChequeo:
    problemas: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problemas


def leer_bloque_decision(texto_adr: str) -> dict[str, str]:
    """Pares clave: valor del bloque ``adr39:decision`` del ADR; vacío si el ADR aún no fija la decisión."""
    coincidencia = BLOQUE.search(texto_adr)
    if not coincidencia:
        return {}
    cargado = yaml.safe_load(coincidencia.group("yaml")) or {}
    return {str(k): str(v) for k, v in cargado.items()}


def leer_env(texto: str) -> dict[str, str]:
    """Pares CLAVE=valor de un ``.env.example`` (ignora comentarios y líneas vacías; sin expandir variables)."""
    valores: dict[str, str] = {}
    for linea in texto.splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        valores[clave.strip()] = valor.split(" #", 1)[0].strip().strip("'\"")
    return valores


def dimension_con_literal(texto_modelo_datos: str) -> list[str]:
    """Líneas de ``dense_vector`` que fijan un número como dimensión (la dimensión vive en configuración y ADR-39)."""
    malas = []
    for numero, linea in enumerate(texto_modelo_datos.splitlines(), start=1):
        if "dense_vector" in linea and LITERAL_NUMERICO.search(REFERENCIA.sub("", linea)):
            malas.append(f"{RUTA_MODELO_DATOS}:{numero}")
    return malas


def problemas_de_claves_contra_entorno(
    decision: dict[str, str], entorno: dict[str, str]
) -> list[str]:
    """Claves faltantes, desconocidas o divergentes entre el bloque del ADR y ``.env.example``."""
    problemas = []
    for clave in CLAVES_OBLIGATORIAS:
        if clave not in entorno or not entorno[clave]:
            problemas.append(f"{RUTA_ENV}: falta {clave}")
    for clave, esperado in decision.items():
        if clave not in CLAVES_ADR39:
            problemas.append(f"{RUTA_ADR}: clave desconocida {clave}")
        elif clave in entorno and entorno[clave] != esperado:
            problemas.append(
                f"{clave}: configuración {entorno[clave]!r} difiere del ADR-39 {esperado!r}"
            )
        elif clave not in entorno and clave not in CLAVES_OBLIGATORIAS:
            problemas.append(f"{RUTA_ENV}: falta {clave}")
    problemas.extend(
        f"{RUTA_ADR}: el bloque de decisión no fija {clave}"
        for clave in CLAVES_ADR39
        if clave not in decision
    )
    return problemas


def problemas_de_configuracion_invalida(entorno: dict[str, str]) -> list[str]:
    try:
        cargar_config_modelos(entorno)
    except ConfigInvalida as exc:
        return [f"{RUTA_ENV}: configuración de modelos inválida: {', '.join(exc.claves)}"]
    return []


def problemas_de_dimension_en_modelo_datos(raiz: Path) -> list[str]:
    modelo_datos = raiz / RUTA_MODELO_DATOS
    if not modelo_datos.exists():
        return []
    return [
        f"{m}: la dimensión de dense_vector no puede ser un literal"
        for m in dimension_con_literal(modelo_datos.read_text(encoding="utf-8"))
    ]


def chequear(raiz: Path) -> ResultadoChequeo:
    resultado = ResultadoChequeo()
    decision = (
        leer_bloque_decision((raiz / RUTA_ADR).read_text(encoding="utf-8"))
        if (raiz / RUTA_ADR).exists()
        else {}
    )
    if not decision:
        resultado.problemas.append(
            f"{RUTA_ADR}: sin bloque de decisión (adr39:decision) con la fase A cerrada"
        )
        return resultado
    entorno = (
        leer_env((raiz / RUTA_ENV).read_text(encoding="utf-8"))
        if (raiz / RUTA_ENV).exists()
        else {}
    )
    resultado.problemas.extend(problemas_de_claves_contra_entorno(decision, entorno))
    resultado.problemas.extend(problemas_de_configuracion_invalida(entorno))
    resultado.problemas.extend(problemas_de_dimension_en_modelo_datos(raiz))
    return resultado


def ejecutar_chequeo(raiz: Path) -> int:
    resultado = chequear(raiz)
    for problema in resultado.problemas:
        print(problema, file=sys.stderr)
    if resultado.ok:
        print("configuración de modelos coherente con ADR-39")
        return 0
    return 5
