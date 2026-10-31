"""Reglas puras del baseline manual de VM-1 y VM-2: sin E/S, solo biblioteca estándar.

Todos los errores nombran fila y regla, nunca el valor rechazado (RN-14).
"""

from __future__ import annotations

import re
from app.evaluation.estadistica import mediana
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

COLUMNAS = (
    "participante",
    "caso",
    "condicion",
    "tiempo_reconstruccion_min",
    "reconstruido",
    "tiempo_evidencia_min",
    "autoidentificada",
    "fuente_id",
    "validada",
)
EJES_CRITICOS = (
    "diagnostico",
    "estadio_a_la_fecha",
    "biomarcadores",
    "intencion_terapeutica",
    "secuencia_previa",
    "linea_actual",
)
TIPOS_DE_CANCER = ("mama", "prostata")
CASOS_MINIMOS_POR_TIPO = 3
CAMPOS_PREGUNTA = ("poblacion", "contexto_clinico", "decision", "fecha_corte_evidencia")
SI_NO = ("si", "no")

Fila = dict[str, str]
Medianas = dict[str, dict[str, float | None]]


@dataclass(frozen=True)
class ConfigVM:
    """Valores de ``eval/vm/baseline.json`` (RN-22)."""

    max_minutos: int
    patron_participante: str
    patron_fuente: str


# --- manifiesto ----------------------------------------------------------------------------------


def _fecha_valida(valor: object) -> bool:
    if not isinstance(valor, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valor):
        return False
    try:
        date.fromisoformat(valor)
    except ValueError:
        return False
    return True


def _errores_de_checklist(id_caso: str, caso: dict[str, Any]) -> list[str]:
    checklist = caso.get("checklist_reconstruccion")
    if not isinstance(checklist, dict):
        return [f"caso {id_caso}: falta checklist_reconstruccion"]
    presentes = {
        "criticos": bool(checklist.get("criticos")),
        "complementarios": isinstance(checklist.get("complementarios"), list),
        "version": bool(checklist.get("version")),
    }
    errores = [
        f"caso {id_caso}: checklist_reconstruccion.{clave} ausente"
        for clave, presente in presentes.items()
        if not presente
    ]
    if not _fecha_valida(checklist.get("fecha_validacion_clinica")):
        errores.append(
            f"caso {id_caso}: checklist_reconstruccion.fecha_validacion_clinica "
            "ausente o fuera del formato AAAA-MM-DD"
        )
    ejes = {c.get("eje") for c in checklist.get("criticos") or [] if isinstance(c, dict)}
    if checklist.get("criticos"):
        errores += [
            f"caso {id_caso}: los criticos no cubren el eje {eje}"
            for eje in EJES_CRITICOS
            if eje not in ejes
        ]
    return errores


def _errores_de_pregunta(id_caso: str, caso: dict[str, Any]) -> list[str]:
    pregunta = caso.get("pregunta_referencia")
    if not isinstance(pregunta, dict):
        return [f"caso {id_caso}: falta pregunta_referencia"]
    errores = [
        f"caso {id_caso}: pregunta_referencia.{campo} ausente"
        for campo in CAMPOS_PREGUNTA
        if not pregunta.get(campo)
    ]
    corte = pregunta.get("fecha_corte_evidencia")
    if corte and not _fecha_valida(corte):
        errores.append(
            f"caso {id_caso}: pregunta_referencia.fecha_corte_evidencia no es AAAA-MM-DD"
        )
    if not pregunta.get("texto"):
        errores.append(f"caso {id_caso}: pregunta_referencia.texto ausente")
    elif corte and corte not in pregunta["texto"]:
        errores.append(f"caso {id_caso}: pregunta_referencia.texto no incluye la fecha de corte")
    return errores


def _errores_de_documentos(
    id_caso: str, caso: dict[str, Any], existe_documento: Callable[[str], bool]
) -> list[str]:
    documentos = caso.get("documentos") or []
    if not documentos:
        return [f"caso {id_caso}: debe referenciar al menos un documento"]
    return [
        f"caso {id_caso}: documento declarado no existe ({ruta})"
        for ruta in documentos
        if not existe_documento(ruta)
    ]


def validar_manifiesto(
    manifiesto: dict[str, Any], existe_documento: Callable[[str], bool]
) -> list[str]:
    """Errores del manifiesto (A3-A4); lista vacía si es válido."""
    errores: list[str] = []
    if manifiesto.get("clase") != "sintetico":
        errores.append("manifiesto: clase debe ser sintetico")
    casos = manifiesto.get("casos") or []
    for tipo in TIPOS_DE_CANCER:
        if sum(1 for c in casos if c.get("tipo_cancer") == tipo) < CASOS_MINIMOS_POR_TIPO:
            errores.append(f"manifiesto: se requieren al menos 3 casos de {tipo}")
    for caso in casos:
        id_caso = str(caso.get("id", "?"))
        errores += _errores_de_documentos(id_caso, caso, existe_documento)
        errores += _errores_de_pregunta(id_caso, caso)
        errores += _errores_de_checklist(id_caso, caso)
    return errores


# --- registro de sesiones ------------------------------------------------------------------------


def validar_cabecera(cabecera: Sequence[str]) -> list[str]:
    """La cabecera del CSV es exactamente el conjunto cerrado de columnas declaradas."""
    errores = [
        f"cabecera: columna no declarada '{columna}'"
        for columna in cabecera
        if columna not in COLUMNAS
    ]
    errores += [
        f"cabecera: falta la columna declarada '{columna}'"
        for columna in COLUMNAS
        if columna not in cabecera
    ]
    return errores


def _numero(texto: str) -> float | None:
    try:
        return float(texto.strip())
    except ValueError:
        return None


def _errores_de_tiempo(columna: str, texto: str, maximo: int, prefijo: str) -> list[str]:
    tiempo = _numero(texto)
    if tiempo is None:
        return [f"{prefijo} columna {columna}: tiempo ausente o no numérico"]
    if tiempo <= 0:
        return [f"{prefijo} columna {columna}: el tiempo debe ser mayor que 0"]
    if tiempo > maximo:
        return [f"{prefijo} columna {columna}: el tiempo supera VM_SESSION_MAX_MINUTES"]
    return []


def _alcanza_el_maximo(texto: str, maximo: int) -> bool:
    tiempo = _numero(texto)
    return tiempo is not None and tiempo == maximo


def _errores_de_desenlaces(fila: Fila, maximo: int, prefijo: str) -> list[str]:
    errores: list[str] = []
    for columna in ("reconstruido", "autoidentificada"):
        if fila.get(columna, "") not in SI_NO:
            errores.append(f"{prefijo} columna {columna}: debe ser si o no")
    pares = (
        ("reconstruido", "tiempo_reconstruccion_min"),
        ("autoidentificada", "tiempo_evidencia_min"),
    )
    for desenlace, tiempo in pares:
        if fila.get(desenlace) == "si" and _alcanza_el_maximo(fila.get(tiempo, ""), maximo):
            errores.append(
                f"{prefijo} columna {desenlace}: una tarea que alcanza el máximo queda no completada"
            )
    return errores


def _errores_de_fuente(fila: Fila, config: ConfigVM, prefijo: str) -> list[str]:
    fuente = fila.get("fuente_id", "")
    if fila.get("autoidentificada") == "no" and fuente:
        return [f"{prefijo} columna fuente_id: debe estar vacío cuando autoidentificada es no"]
    if fila.get("autoidentificada") == "si":
        if not fuente:
            return [f"{prefijo} columna fuente_id: es obligatorio cuando autoidentificada es si"]
        if not re.fullmatch(config.patron_fuente, fuente):
            return [f"{prefijo} columna fuente_id: no cumple VM_SOURCE_ID_PATTERN"]
    return []


def validar_fila_sesion(fila: Fila, numero: int, casos: set[str], config: ConfigVM) -> list[str]:
    """Reglas de una fila; el error nombra fila y columna, nunca el valor."""
    prefijo = f"fila {numero}:"
    errores: list[str] = []
    if not re.fullmatch(config.patron_participante, fila.get("participante", "")):
        errores.append(f"{prefijo} columna participante: debe ser un seudónimo O<n>")
    if fila.get("caso", "") not in casos:
        errores.append(f"{prefijo} columna caso: no está en el manifiesto")
    if fila.get("condicion", "") != "manual":
        errores.append(f"{prefijo} columna condicion: debe ser manual")
    for columna in ("tiempo_reconstruccion_min", "tiempo_evidencia_min"):
        errores += _errores_de_tiempo(columna, fila.get(columna, ""), config.max_minutos, prefijo)
    errores += _errores_de_desenlaces(fila, config.max_minutos, prefijo)
    errores += _errores_de_fuente(fila, config, prefijo)
    return errores


def validar_coherencia_validacion(filas: Sequence[Fila]) -> list[str]:
    """``validada`` coherente con ``autoidentificada``; el mismo par caso–fuente, el mismo veredicto."""
    errores: list[str] = []
    veredictos: dict[tuple[str, str], dict[str, list[int]]] = {}
    for numero, fila in enumerate(filas, start=2):
        validada = fila.get("validada", "")
        if validada == "":
            errores.append(f"fila {numero}: columna validada: validación pendiente")
            continue
        if validada not in SI_NO:
            errores.append(f"fila {numero}: columna validada: debe ser si o no")
            continue
        if validada == "si" and (fila.get("autoidentificada") != "si" or not fila.get("fuente_id")):
            errores.append(
                f"fila {numero}: columna validada: validada=si exige autoidentificada=si y fuente_id"
            )
        if fila.get("fuente_id"):
            par = (fila.get("caso", ""), fila["fuente_id"])
            veredictos.setdefault(par, {}).setdefault(validada, []).append(numero)
    for por_veredicto in veredictos.values():
        if len(por_veredicto) > 1:
            filas_del_par = sorted(n for numeros in por_veredicto.values() for n in numeros)
            errores.append(
                f"filas {', '.join(map(str, filas_del_par))}: "
                "un mismo par caso–fuente tiene veredictos distintos en validada"
            )
    return errores


def validar_sesiones(
    filas: Sequence[Fila], manifiesto: dict[str, Any], config: ConfigVM
) -> list[str]:
    """Reglas por fila y unicidad caso+participante; no exige la validación de VM-2."""
    casos = {c["id"] for c in manifiesto["casos"]}
    errores: list[str] = []
    vistos: set[tuple[str, str]] = set()
    for numero, fila in enumerate(filas, start=2):
        errores += validar_fila_sesion(fila, numero, casos, config)
        clave = (fila.get("caso", ""), fila.get("participante", ""))
        if clave in vistos:
            errores.append(f"fila {numero}: columna caso: sesión duplicada (caso y participante)")
        vistos.add(clave)
    return errores


def validar_registro(
    filas: Sequence[Fila], manifiesto: dict[str, Any], config: ConfigVM
) -> list[str]:
    """Todas las reglas del registro, incluida la validación ciega de VM-2."""
    return validar_sesiones(filas, manifiesto, config) + validar_coherencia_validacion(filas)


# --- pares y medianas ----------------------------------------------------------------------------


def pares_para_validacion(
    filas: Sequence[Fila], manifiesto: dict[str, Any]
) -> list[tuple[str, str, str]]:
    """Pares (caso, texto de la pregunta, fuente) únicos y ordenados; sin tiempo ni participante."""
    textos = {c["id"]: c["pregunta_referencia"]["texto"] for c in manifiesto["casos"]}
    pares = {(f["caso"], f["fuente_id"]) for f in filas if f.get("fuente_id")}
    return [(caso, textos[caso], fuente) for caso, fuente in sorted(pares)]


def _mediana(valores: Iterable[float]) -> float | None:
    lista = list(valores)
    return float(mediana(lista)) if lista else None


def _tiempos_por_tipo(
    filas: Sequence[Fila],
    tipos: dict[str, str],
    columna_tiempo: str,
    completada: Callable[[Fila], bool],
    maximo: int,
) -> dict[str, list[float]]:
    """Tiempo por tipo de cáncer; la tarea no completada entra con el máximo (censura a la derecha)."""
    por_tipo: dict[str, list[float]] = {tipo: [] for tipo in TIPOS_DE_CANCER}
    for fila in filas:
        tiempo = _numero(fila[columna_tiempo])
        por_tipo[tipos[fila["caso"]]].append(
            tiempo if completada(fila) and tiempo is not None else float(maximo)
        )
    return por_tipo


def medianas_por_tipo(
    filas: Sequence[Fila], manifiesto: dict[str, Any], max_minutos: int
) -> Medianas:
    """VM-1 y las dos medianas de VM-2 (autoidentificada y validada) por tipo y total."""
    tipos = {c["id"]: c["tipo_cancer"] for c in manifiesto["casos"]}
    metricas: dict[str, tuple[str, Callable[[Fila], bool]]] = {
        "vm1": ("tiempo_reconstruccion_min", lambda f: f["reconstruido"] == "si"),
        "vm2_autoidentificada": ("tiempo_evidencia_min", lambda f: f["autoidentificada"] == "si"),
        "vm2_validada": ("tiempo_evidencia_min", lambda f: f.get("validada") == "si"),
    }
    resultado: Medianas = {}
    for nombre, (columna, completada) in metricas.items():
        por_tipo = _tiempos_por_tipo(filas, tipos, columna, completada, max_minutos)
        resultado[nombre] = {tipo: _mediana(v) for tipo, v in por_tipo.items()}
        resultado[nombre]["total"] = _mediana(t for v in por_tipo.values() for t in v)
    return resultado
