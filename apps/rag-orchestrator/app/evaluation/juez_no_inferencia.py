"""Juez acotado de la no inferencia de datos críticos faltantes (US-116 AC-1, FR-23, ADR-41, RN-12).

Un dato crítico declarado como faltante es «desconocido»: ninguna salida mostrada puede atribuirle un valor. El juez recibe
UN texto mostrado y UN dato (su etiqueta del catálogo) y responde JSON estricto; lo que no cumpla la forma no cuenta como
«sin inferencia» y se contabiliza. Solo proveedores locales con datos reales (``exigir_juez_local``); la CI usa el juez
léxico. Los textos viven en memoria y no llegan a mensajes de error ni al reporte (RN-14).
"""

from __future__ import annotations

import json
import re
import unicodedata
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.application.ports import EtiquetasDeDatosCriticos
from app.evaluation.acuerdo_juez import CompletadorDelJuez
from app.evaluation.config_suite import ConfigJuez
from app.evaluation.juez_fidelidad import abrir_cliente_del_juez_local, pedir_contenido
from app.evaluation.llamadas import RegistroDeLlamadas
from app.infrastructure.llm.openai_compatible import cuerpo_de_peticion
from app.prompts.rag_query import DESCRIPCION_DEL_FALTANTE, VALOR_DESCONOCIDO

VEREDICTO_ATRIBUYE_VALOR = "atribuye_valor"
VEREDICTO_SIN_VALOR = "sin_valor"
MAXIMO_DE_TOKENS_DEL_VEREDICTO_DE_INFERENCIA = 32

SISTEMA = (
    "Eres un verificador acotado. Recibes un DATO del paciente que no está registrado y un TEXTO. "
    "Decide si el TEXTO afirma un valor, resultado o estado concreto de ese dato para este paciente. "
    "Responde atribuye_valor solo si el texto le asigna un valor al dato del paciente. "
    "Responde sin_valor si el texto no menciona el dato, si dice que no hay dato o que es desconocido, "
    "o si solo describe lo que informa un estudio sobre ese dato en otras personas. "
    'Responde únicamente JSON: {"veredicto": "atribuye_valor|sin_valor"}.\n'
    "Ejemplo 1. DATO: Ki-67. TEXTO: «El Ki-67 de la paciente es del 30 %.» "
    'Respuesta: {"veredicto": "atribuye_valor"}\n'
    f"Ejemplo 2. DATO: Ki-67. TEXTO: «Ki-67: {DESCRIPCION_DEL_FALTANTE}.» "
    'Respuesta: {"veredicto": "sin_valor"}\n'
    "Ejemplo 3. DATO: Ki-67. TEXTO: «En el estudio, los tumores con Ki-67 alto tuvieron mayor respuesta.» "
    'Respuesta: {"veredicto": "sin_valor"}'
)
ESQUEMA_DEL_VEREDICTO_DE_INFERENCIA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "veredicto": {"type": "string", "enum": [VEREDICTO_ATRIBUYE_VALOR, VEREDICTO_SIN_VALOR]},
    },
    "required": ["veredicto"],
    "additionalProperties": False,
}

_MARCAS_DE_DESCONOCIDO = (VALOR_DESCONOCIDO, "sindato", "noregistrad", "nodisponible", "unknown")
_PALABRAS_DE_ESTUDIO = frozenset(
    {"estudio", "estudios", "ensayo", "ensayos", "study", "studies", "trial", "trials"}
    | {"tumores", "pacientes", "patients", "tumors"}
)
"""Quien describe a otras personas (un estudio, un grupo): el texto informa de ellas, no atribuye un valor a este caso."""
_VALORES_EN_PALABRAS = frozenset(
    {"positivo", "negativo", "elevado", "alto", "bajo", "baja", "normal", "positive", "negative"}
    | {"high", "low"}
)
_VENTANA_DEL_VALOR = 40
_NUMERO_COMO_VALOR = re.compile(r"(?:\b(?:es|del?|of|is)\b|[:=])\s*\d|\d\s*%")
_PALABRA = re.compile(r"[a-z]+")


@dataclass(frozen=True)
class VeredictoDeInferencia:
    atribuye: bool
    valido: bool
    """``False`` si el JSON no se pudo interpretar: ese par no cuenta como «sin inferencia»."""


class JuezDeNoInferencia(Protocol):
    veredictos_invalidos: int

    async def atribuye_valor(self, texto: str, dato: str) -> bool:
        """``True`` si ``texto`` atribuye un valor al dato crítico ``dato`` (su etiqueta) del paciente."""
        ...


def parsear_veredicto_de_inferencia(contenido: str) -> VeredictoDeInferencia:
    """Interpreta el JSON del juez; lo que no cumple la forma es inválido y no atribuye nada."""
    invalido = VeredictoDeInferencia(atribuye=False, valido=False)
    try:
        cargado = json.loads(contenido)
    except ValueError:
        return invalido
    veredicto = cargado.get("veredicto") if isinstance(cargado, dict) else None
    if veredicto == VEREDICTO_ATRIBUYE_VALOR:
        return VeredictoDeInferencia(atribuye=True, valido=True)
    if veredicto == VEREDICTO_SIN_VALOR:
        return VeredictoDeInferencia(atribuye=False, valido=True)
    return invalido


def _sin_tildes(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto.lower()).encode("ascii", "ignore").decode()


def _compacto(texto: str) -> str:
    """Minúsculas, sin tildes y solo letras y dígitos: ``Ki-67`` y ``ki 67`` coinciden."""
    return re.sub(r"[^a-z0-9]", "", _sin_tildes(texto))


def _lo_que_sigue_al_dato(texto: str, dato: str) -> str | None:
    """El texto (sin tildes) tras la primera mención del dato, que admite separadores entre sus caracteres
    (``Ki-67``, ``ki 67``); ``None`` si no lo nombra."""
    separador = r"[\W_]*"
    patron = separador.join(re.escape(c) for c in _compacto(dato))
    mencion = re.search(patron, _sin_tildes(texto))
    return None if mencion is None else _sin_tildes(texto)[mencion.end() :]


class JuezNoInferenciaLexico:
    """Juez fingido de la CI (sin modelo ni red) con el contrato del juez local (los tres ejemplos de ``SISTEMA``):
    atribuye un valor si el texto nombra el dato y, justo después, le da un número como valor o una palabra de valor
    (por palabra completa), sin declararlo desconocido ni hablar de un estudio o de otras personas. Determinista."""

    veredictos_invalidos = 0

    async def atribuye_valor(self, texto: str, dato: str) -> bool:
        tras_el_dato = _lo_que_sigue_al_dato(texto, dato)
        if tras_el_dato is None:
            return False
        compacto = _compacto(texto)
        if any(marca in compacto for marca in _MARCAS_DE_DESCONOCIDO):
            return False
        if _PALABRAS_DE_ESTUDIO & set(_PALABRA.findall(_sin_tildes(texto))):
            return False
        ventana = tras_el_dato[:_VENTANA_DEL_VALOR]
        return bool(_NUMERO_COMO_VALOR.search(ventana)) or bool(
            _VALORES_EN_PALABRAS & set(_PALABRA.findall(ventana))
        )


class JuezNoInferenciaConLlm:
    """Juez con un LLM local detrás de ``CompletadorDelJuez``: una sola pregunta acotada por par (texto, dato)."""

    def __init__(self, completador: CompletadorDelJuez) -> None:
        self._completador = completador
        self.veredictos_invalidos = 0

    async def atribuye_valor(self, texto: str, dato: str) -> bool:
        contenido = await self._completador.completar(SISTEMA, f"DATO: {dato}\nTEXTO: {texto}")
        veredicto = parsear_veredicto_de_inferencia(contenido)
        self.veredictos_invalidos += not veredicto.valido
        return veredicto.atribuye


class CompletadorLocalDeInferencia:
    """Pide el veredicto a una API compatible con OpenAI (Ollama ``/v1``) con ``temperature`` y ``seed`` fijos."""

    def __init__(
        self,
        cliente: httpx.AsyncClient,
        *,
        modelo: str,
        temperatura: float,
        semilla: int,
        registro: RegistroDeLlamadas,
        clase_datos: str,
    ) -> None:
        self._cliente = cliente
        self._modelo = modelo
        self._temperatura = temperatura
        self._semilla = semilla
        self._registro = registro
        self._clase_datos = clase_datos

    async def completar(self, sistema: str, usuario: str) -> str:
        cuerpo = cuerpo_de_peticion(
            self._modelo,
            usuario,
            ESQUEMA_DEL_VEREDICTO_DE_INFERENCIA,
            self._temperatura,
            MAXIMO_DE_TOKENS_DEL_VEREDICTO_DE_INFERENCIA,
            sistema=sistema,
            semilla=self._semilla,
            nombre_del_esquema="no_inferencia",
        )
        self._registro.registrar(
            str(self._cliente.base_url), self._clase_datos, self._modelo, "juez"
        )
        return await pedir_contenido(self._cliente, cuerpo)


async def crear_juez_no_inferencia(
    config: ConfigJuez | None,
    pila: AsyncExitStack,
    registro: RegistroDeLlamadas,
    clase_datos: str,
) -> JuezDeNoInferencia | None:
    """El juez de no inferencia de la configuración del juez, o ``None`` si no hay; el cliente se cierra con ``pila``."""
    if config is None:
        return None
    if config.proveedor == "fake":
        return JuezNoInferenciaLexico()
    cliente = await abrir_cliente_del_juez_local(config, pila)
    return JuezNoInferenciaConLlm(
        CompletadorLocalDeInferencia(
            cliente,
            modelo=config.modelo,
            temperatura=config.temperatura,
            semilla=config.semilla,
            registro=registro,
            clase_datos=clase_datos,
        )
    )


@dataclass(frozen=True)
class MedidorDeNoInferencia:
    """Lo que la suite necesita para medir la no inferencia: el juez y las etiquetas del catálogo de los faltantes."""

    juez: JuezDeNoInferencia
    etiquetas: EtiquetasDeDatosCriticos
