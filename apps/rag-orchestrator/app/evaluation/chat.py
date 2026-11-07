"""Evaluación del chat (US-269, OL-06): ``chat-v1`` sobre el grafo de PRODUCCIÓN, en proceso.

``python -m app.evaluation.chat --config <ruta> [--dataset <dir>] [--peticiones <dir>] [--salida <dir>]``. Compone el
``ChatTurnService`` de producción (grafo, nodos, filtro de RN-23, validador de citas y NLI) sobre el servicio de recuperación de
la suite (``componer_servicio``); solo cambian los bordes: con ``proveedor: fake`` el LLM es el guion de cada caso (FX-12-e) y
el NLI el léxico de la suite; con ``proveedor: local`` son los modelos locales de ADR-39 (RN-12).

Las peticiones salen de ``clinical-api`` (``npm run eval:chat-preparar``: pipeline de producción, desidentificación incluida,
una ``<id-del-caso>.json`` por caso con ``peticion``, ``hechosPorClave`` e ``identidad``) o, sin ``--peticiones`` y con
adapters falsos, de los ejemplos de ``contracts/examples/`` que el dataset nombra. Solo datos sintéticos (RN-14): el reporte
lleva agregados e ids de caso, nunca texto, ni identidad. El p95 es informativo (ADR-51) y la revisión pendiente no bloquea:
solo RN-23 y la no fuga (RN-10, RN-11) cambian el código de salida.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import sys
import time
import uuid
from collections import defaultdict
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.application.chat.servicio_de_turno import ChatTurnService
from app.application.ports import LlmClient, NliClassifier, ProhibitedTermsChecker
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.adaptadores_falsos import (
    CatalogoClinicoDeConfig,
    CatalogoEnMemoria,
    LectorReleaseFijo,
    PosicionesDelDataset,
)
from app.evaluation.composicion_suite import ServicioDeSuite, componer_servicio
from app.evaluation.config_suite import ConfigSuite, cargar_config_suite
from app.evaluation.cronometro import Cronometro, RelojSimulado, resumen_de_latencia
from app.evaluation.dataset_chat import (
    CasoDeChat,
    ControlDeChat,
    DatasetDeChat,
    GuionDelLlm,
    cargar_dataset_de_chat,
)
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.juez_fidelidad import JuezNli
from app.evaluation.rotulo import rotular_validada
from app.evaluation.rutas import raiz_repo
from app.evaluation.seguimiento import ajustes_de_la_suite
from app.infrastructure.catalogo_clinico.datos_criticos import cargar_datos_criticos
from app.infrastructure.catalogo_clinico.relevancia import cargar_datos_de_relevancia
from app.infrastructure.catalogo_clinico.sinonimos import cargar_terminos_por_tipo
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.tokenizer.contador_conservador import ContadorConservador
from app.prompts.chat import VERSION_DEL_PROMPT_DE_CHAT
from app.prompts.chat_caso import VERSION_DEL_PROMPT_DE_CASO
from app.prompts.chat_relevancia import VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT
from app.schemas.generated.models import ChatTurnRequest

DATASET_POR_DEFECTO = Path("data/eval/chat-v1")
EJEMPLOS = Path("contracts/examples")
TIPOS_DE_BLOQUE_CON_ENLACE = ("documentado", "interpretacion", "conflicto")
ACS_DEL_CASO = ("AC01", "AC02")
"""Los turnos con ``intent = caso`` cuyas afirmaciones miden M-02.1 y M-02.3 (AC-3)."""
MARCADOR_DE_IDENTIDAD = re.compile(r"\{identidad_sintetica:[^}]+\}")
MASCARA_DE_LA_DESIDENTIFICACION = "[REDACTADO]"
ESPACIO_DE_HILOS = uuid.UUID("5b0e7a3c-2f64-4d8a-9c1e-7a4f3b2d1e90")
INTENCIONES = ("caso", "faltantes", "evidencia", "fuentes_limitaciones")
CODIGO_DE_FUGA_O_PRESCRIPTIVO = 1


@dataclass(frozen=True)
class PeticionDeChat:
    """Lo que ``clinical-api`` prepara por caso: la petición desidentificada, la traducción clave del seed → ``factRef`` y
    los textos de identidad que NO deben aparecer en ninguna parte (solo para contarlos)."""

    peticion: ChatTurnRequest
    hechos_por_clave: Mapping[str, str]
    identidad: tuple[str, ...] = ()


@dataclass(frozen=True)
class PuertosDeChat:
    """Lo que la corrida sustituye del grafo de producción: el filtro de RN-23 (un test lo desactiva) y, con modelos
    locales, el cliente del LLM, el NLI y los puertos de la suite."""

    verificador_terminos: ProhibitedTermsChecker | None = None
    llm: LlmClient | None = None
    locales: Any | None = None


def identidad_de_prueba() -> tuple[str, ...]:
    """Una identidad sintética compuesta en ejecución (nombre, documento y fecha de nacimiento): nunca un literal del
    repositorio (RN-14). Con adapters falsos es lo que se busca en el estado del hilo y en los *logs*."""
    anio, mes, dia = 1970 + 1, 4, 3
    return (
        "Paciente Sintetica Evaluacion",
        "SINT-EVAL-" + "ABC",
        f"{anio:04d}-{mes:02d}-{dia:02d}",
    )


def _leer_json(ruta: Path) -> dict[str, Any]:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise DatasetInvalido(f"no se pudo leer {ruta.name}") from None


def _pregunta_enmascarada(pregunta: str) -> str:
    """Lo que la desidentificación de ``clinical-api`` deja del marcador de identidad de la pregunta."""
    return MARCADOR_DE_IDENTIDAD.sub(MASCARA_DE_LA_DESIDENTIFICACION, pregunta)


def peticiones_de_ejemplo(dataset: DatasetDeChat, config: ConfigSuite) -> dict[str, PeticionDeChat]:
    """La petición de cada caso y control con adapters falsos: el ejemplo del contrato que el caso nombra, con su pregunta."""
    peticiones: dict[str, PeticionDeChat] = {}
    for caso in (*dataset.casos, *dataset.controles):
        crudo = _leer_json(raiz_repo() / EJEMPLOS / caso.ejemplo.base)
        crudo["question"] = _pregunta_enmascarada(caso.pregunta)
        crudo["catalogVersion"] = config.catalogo_version
        crudo.pop("activeAnalysisId", None)
        con_identidad = MARCADOR_DE_IDENTIDAD.search(caso.pregunta) is not None
        peticiones[caso.id] = PeticionDeChat(
            peticion=ChatTurnRequest.model_validate(crudo),
            hechos_por_clave=dict(caso.ejemplo.hechos),
            identidad=identidad_de_prueba() if con_identidad else (),
        )
    return peticiones


def cargar_peticiones(directorio: Path, config: ConfigSuite) -> dict[str, PeticionDeChat]:
    """Las peticiones que dejó ``eval:chat-preparar`` (una ``<id>.json`` por caso); la versión de catálogo es la de la suite."""
    peticiones: dict[str, PeticionDeChat] = {}
    for ruta in sorted(directorio.glob("*.json")):
        crudo = _leer_json(ruta)
        try:
            peticion = ChatTurnRequest.model_validate(
                {**crudo["peticion"], "catalogVersion": config.catalogo_version}
            )
        except (KeyError, ValidationError):
            raise DatasetInvalido(f"la petición {ruta.stem} no cumple ChatTurnRequest") from None
        peticiones[ruta.stem] = PeticionDeChat(
            peticion,
            dict(crudo.get("hechosPorClave", {})),
            tuple(crudo.get("identidad", [])),
        )
    return peticiones


class ClienteDelChat:
    """``LlmClient`` del chat con adapters falsos: responde el guion del caso activo (la intención al clasificar, las
    afirmaciones al generar) y cuenta las llamadas; sin guion activo, falla como el LLM real caído."""

    def __init__(self) -> None:
        self._guion: GuionDelLlm | None = None
        self.invocaciones = 0

    def activar(self, guion: GuionDelLlm) -> None:
        self._guion = guion

    async def completar_json(
        self, usuario: str, esquema: Mapping[str, Any], *, sistema: str | None = None
    ) -> str:
        from app.application.ports import FalloDelLlm

        self.invocaciones += 1
        if self._guion is None:
            raise FalloDelLlm("sin guion activo")
        if "intent" in esquema.get("properties", {}):
            return json.dumps({"intent": self._guion.ruta})
        afirmaciones = [
            {"citations": [], **dict(a)} for a in self._guion.afirmaciones
        ]  # el contrato de la generación: toda afirmación trae sus citas
        return json.dumps({"claims": afirmaciones}, ensure_ascii=False)


class NliDelChat:
    """El NLI de la suite; un control con ``NLI falso entailment`` (FX-12-e) lo fuerza para probar el filtro de RN-23."""

    def __init__(self, base: NliClassifier) -> None:
        self._base = base
        self.forzar_entailment = False

    @property
    def version(self) -> str:
        return self._base.version

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        if self.forzar_entailment:
            return [ResultadoNli(label="entailment", p_entailment=0.97) for _ in pares]
        return self._base.clasificar(pares)


class _CapturaDeLogs(logging.Handler):
    """Los mensajes de log de un turno, para contar en ellos la identidad (nunca se publican)."""

    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.mensajes: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.mensajes.append(record.getMessage())


@contextmanager
def _capturando_logs() -> Iterator[_CapturaDeLogs]:
    raiz = logging.getLogger()
    captura, nivel = _CapturaDeLogs(), raiz.level
    raiz.addHandler(captura)
    raiz.setLevel(logging.DEBUG)
    try:
        yield captura
    finally:
        raiz.removeHandler(captura)
        raiz.setLevel(nivel)


@dataclass
class _Corrida:
    """El chat compuesto: el servicio de producción y los bordes que la corrida activa por caso."""

    servicio: ChatTurnService
    suite: ServicioDeSuite
    cliente: ClienteDelChat | None
    nli: NliDelChat
    juez: JuezNli


def _componer_el_chat(
    config: ConfigSuite, dataset: DatasetDeChat, puertos: PuertosDeChat
) -> _Corrida:
    corpus = FuenteDatasetEnDirectorio(raiz_repo() / dataset.corpus).cargar()
    suite = componer_servicio(
        config,
        corpus,
        Cronometro(RelojSimulado()),
        RelojDelSistema(),
        puertos_locales=puertos.locales,
    )
    ajustes = ajustes_de_la_suite(config)
    tipos = ajustes.enabled_cancer_types
    from app.evaluation.adaptadores_falsos import NliLexico

    nli = NliDelChat(puertos.locales.clasificador_nli if puertos.locales else NliLexico())
    verificador = puertos.verificador_terminos or suite.verificador_produccion
    cliente = ClienteDelChat() if puertos.llm is None else None
    servicio = ChatTurnService(
        llm=puertos.llm or cliente,  # type: ignore[arg-type]
        catalogo=CatalogoClinicoDeConfig(config.catalogo_version, tipos),
        contador=ContadorConservador(),
        reloj=RelojDelSistema(),
        settings=ajustes,
        terminos_por_tipo=cargar_terminos_por_tipo(config.ruta_terminos, tipos),
        verificador_terminos=verificador,
        servicio_de_evidencia=suite.servicio,
        posiciones=PosicionesDelDataset(corpus),
        fuentes_documentales=cargar_datos_criticos(config.ruta_terminos, tipos),
        soporte=VerificadorDeSoporte(
            clasificador=nli,
            terminos=verificador,
            umbral=config.umbrales.nli_entailment_threshold,
            reloj=RelojDelSistema(),
            max_palabras_por_afirmacion=config.umbrales.claim_max_words,
        ),
        catalogo_del_corpus=CatalogoEnMemoria(corpus),
        lector_release=LectorReleaseFijo(corpus),
        relevancia=cargar_datos_de_relevancia(config.ruta_terminos, tipos),
    )
    juez = JuezNli(nli, config.umbrales.nli_entailment_threshold)
    return _Corrida(servicio, suite, cliente, nli, juez)


def _hilo_de(caso: CasoDeChat | ControlDeChat, raices: dict[str, str]) -> str:
    """Un hilo por conversación: el caso con ``previo`` continúa el del turno anterior (determinista, sin ``uuid4``)."""
    previo = getattr(caso, "previo", None)
    raiz = raices[previo] if previo is not None else caso.id
    raices[caso.id] = raiz
    return str(uuid.uuid5(ESPACIO_DE_HILOS, raiz))


def _en_el_hilo(peticion: ChatTurnRequest, hilo: str, es_primer_turno: bool) -> ChatTurnRequest:
    """El turno de un hilo vivo no lleva la rehidratación (solo el primero la trae, como exige el contrato)."""
    cambios: dict[str, Any] = {"threadId": hilo}
    if not es_primer_turno:
        cambios["rehydration"] = None
    return peticion.model_copy(update=cambios)


def _texto_del_estado(corrida: _Corrida, hilo: str) -> str:
    ultimo = corrida.servicio.registro.guardado.get_tuple(
        corrida.servicio.registro.configuracion(hilo)
    )
    return "" if ultimo is None else str(ultimo.checkpoint["channel_values"])


def _apariciones(identidad: Sequence[str], textos: Sequence[str]) -> int:
    """Cuántos textos de identidad aparecen en alguno de ``textos`` (sin distinguir mayúsculas)."""
    junto = "\n".join(textos).lower()
    return sum(1 for fragmento in identidad if fragmento.lower() in junto)


@dataclass
class _Acumulador:
    """Conteos por tipo de cáncer de los turnos de AC01 y AC02 (AC-3)."""

    afirmaciones: int = 0
    con_soporte: int = 0
    enlaces: int = 0
    enlaces_correctos: int = 0
    hechos_esperados: int = 0
    hechos_presentes: int = 0
    omitidas: int = 0


@dataclass
class _Medidas:
    por_tipo: dict[str, _Acumulador] = field(default_factory=lambda: defaultdict(_Acumulador))
    latencias: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))
    por_caso: list[dict[str, Any]] = field(default_factory=list)
    prescriptivas: int = 0
    identidad_en_estado: int = 0
    identidad_en_logs: int = 0
    control: dict[str, int] = field(
        default_factory=lambda: {"afirmaciones_omitidas": 0, "salidas_prescriptivas_mostradas": 0}
    )


async def _medir_soporte_y_enlaces(
    corrida: _Corrida,
    caso: CasoDeChat,
    entrada: PeticionDeChat,
    respuesta: dict[str, Any],
    acumulado: _Acumulador,
) -> None:
    """M-02.1, M-02.2 y M-02.3 de un turno de ``caso``: soporte (el NLI re-juzga cada interpretación contra los hechos que
    cita; un ``documentado`` es el hecho y solo debe ser resoluble), enlaces al hecho esperado y hechos esperados presentes."""
    verbalizaciones = {
        h["factRef"]: h["verbalization"]
        for h in entrada.peticion.model_dump(mode="json")["caseFacts"]
    }
    esperados = {
        entrada.hechos_por_clave[k] for k in caso.hechos_esperados if k in entrada.hechos_por_clave
    }
    mostrados: set[str] = set()
    for bloque in respuesta["blocks"]:
        if bloque["kind"] not in TIPOS_DE_BLOQUE_CON_ENLACE:
            continue
        referencias = bloque.get("factRefs", [])
        acumulado.afirmaciones += 1
        if bloque["kind"] == "documentado":
            acumulado.con_soporte += all(r in verbalizaciones for r in referencias)
        else:
            premisas = [verbalizaciones[r] for r in referencias if r in verbalizaciones]
            acumulado.con_soporte += await corrida.juez.juzgar_soporte(bloque["text"], premisas)
        for referencia in referencias:
            acumulado.enlaces += 1
            acumulado.enlaces_correctos += referencia in esperados
            mostrados.add(referencia)
    acumulado.hechos_esperados += len(caso.hechos_esperados)
    acumulado.hechos_presentes += len(esperados & mostrados)
    acumulado.omitidas += respuesta["omittedClaims"]


def _salidas_prescriptivas(corrida: _Corrida, respuesta: dict[str, Any]) -> int:
    """Los bloques mostrados que la política de RN-23 rechazaría: se mide sobre la RESPUESTA, no sobre el filtro."""
    verificador = corrida.suite.verificador_estricto
    return sum(
        bool(verificador.coincidencias_mostradas(b["text"], "rationale"))
        for b in respuesta["blocks"]
    )


async def _turno(
    corrida: _Corrida,
    caso: CasoDeChat | ControlDeChat,
    entrada: PeticionDeChat,
    hilo: str,
    reloj: Callable[[], float],
    es_primer_turno: bool,
) -> tuple[dict[str, Any] | None, float, list[str]]:
    """Un turno por el servicio de producción: la respuesta (``None`` si falló), su latencia en ms y los logs que dejó."""
    if corrida.cliente is not None:
        corrida.cliente.activar(caso.guion)
    corrida.nli.forzar_entailment = isinstance(caso, ControlDeChat)
    peticion = _en_el_hilo(entrada.peticion, hilo, es_primer_turno)
    with _capturando_logs() as captura:
        inicio = reloj()
        try:
            respuesta = await corrida.servicio.turno(peticion)
            cuerpo: dict[str, Any] | None = respuesta.model_dump(
                mode="json", exclude_unset=True, by_alias=True
            )
        except Exception:  # un turno caído cuenta como intención errada; nunca se publica la causa
            cuerpo = None
        milisegundos = (reloj() - inicio) * 1000
    return cuerpo, milisegundos, captura.mensajes


async def evaluar(
    config: ConfigSuite,
    dataset: DatasetDeChat,
    peticiones: Mapping[str, PeticionDeChat],
    *,
    puertos: PuertosDeChat | None = None,
) -> dict[str, Any]:
    puertos = puertos or PuertosDeChat()
    corrida = _componer_el_chat(config, dataset, puertos)
    reloj = RelojSimulado() if config.reloj == "simulado" else time.perf_counter
    medidas, raices = _Medidas(), {}
    for caso in (*dataset.casos, *dataset.controles):
        entrada = peticiones[caso.id]
        hilo = _hilo_de(caso, raices)
        respuesta, ms, logs = await _turno(
            corrida, caso, entrada, hilo, reloj, getattr(caso, "previo", None) is None
        )
        medidas.identidad_en_estado += _apariciones(
            entrada.identidad, [_texto_del_estado(corrida, hilo)]
        )
        medidas.identidad_en_logs += _apariciones(entrada.identidad, logs)
        await _registrar(corrida, caso, entrada, respuesta, ms, medidas)
    return _reporte(config, dataset, medidas)


async def _registrar(
    corrida: _Corrida,
    caso: CasoDeChat | ControlDeChat,
    entrada: PeticionDeChat,
    respuesta: dict[str, Any] | None,
    milisegundos: float,
    medidas: _Medidas,
) -> None:
    prescriptivas = 0 if respuesta is None else _salidas_prescriptivas(corrida, respuesta)
    medidas.prescriptivas += prescriptivas
    if isinstance(caso, ControlDeChat):
        medidas.control["afirmaciones_omitidas"] += (
            0 if respuesta is None else respuesta["omittedClaims"]
        )
        medidas.control["salidas_prescriptivas_mostradas"] += prescriptivas
        return
    intent = None if respuesta is None else respuesta["intent"]
    medidas.latencias[caso.intent].append(milisegundos)
    medidas.latencias["__turno__"].append(milisegundos)
    medidas.por_caso.append(
        {
            "id": caso.id,
            "ac": caso.ac,
            "cancer": caso.cancer,
            "intent": intent,
            "intent_correcto": intent == caso.intent,
        }
    )
    if respuesta is not None and caso.intent == "caso" and caso.ac in ACS_DEL_CASO:
        await _medir_soporte_y_enlaces(
            corrida, caso, entrada, respuesta, medidas.por_tipo[caso.cancer]
        )


def _razon(parte: int, total: int) -> float | None:
    return None if total == 0 else parte / total  # sin muestra: None, nunca 0.0


def _por_tipo(medidas: _Medidas) -> dict[str, dict[str, Any]]:
    return {
        tipo: {
            "soporte_nli": _razon(a.con_soporte, a.afirmaciones),
            "precision_de_enlaces": _razon(a.enlaces_correctos, a.enlaces),
            "hechos_presentes": _razon(a.hechos_presentes, a.hechos_esperados),
            "afirmaciones_mostradas": a.afirmaciones,
            "afirmaciones_omitidas": a.omitidas,
        }
        for tipo, a in sorted(medidas.por_tipo.items())
    }


def _resumen(milisegundos: Sequence[float]) -> dict[str, float | None]:
    """Muestra, p50 y p95 al microsegundo (el ruido del reloj simulado no cambia el reporte); sin muestra, ``None``."""
    resumen = resumen_de_latencia(milisegundos)
    return {k: (None if v is None else round(v, 3)) for k, v in resumen.items()}


def _latencia(medidas: _Medidas) -> dict[str, Any]:
    return {
        "informativa": True,
        "turno": _resumen(medidas.latencias["__turno__"]),
        "por_intencion": {
            intencion: _resumen(medidas.latencias[intencion])
            for intencion in INTENCIONES
            if medidas.latencias[intencion]
        },
    }


def _revision(dataset: DatasetDeChat) -> dict[str, Any]:
    pendientes = [c.id for c in dataset.casos if c.revision_oncologo == "pendiente"]
    validacion = rotular_validada(len(dataset.casos) - len(pendientes), len(pendientes))
    return {"rotulo": validacion.rotulo, "pendientes": pendientes}


def _reporte(config: ConfigSuite, dataset: DatasetDeChat, medidas: _Medidas) -> dict[str, Any]:
    return {
        "suite": "chat",
        "config": config.nombre,
        "huella_config": config.hash_config,
        "dataset": {"nombre": dataset.nombre, "version": dataset.version, "clase": dataset.clase},
        "casos": len(dataset.casos),
        "controles": len(dataset.controles),
        "modelos": {"llm": config.llm_modelo, "proveedor": config.proveedor},
        "catalogVersion": config.catalogo_version,
        "prompts": {
            "chat": VERSION_DEL_PROMPT_DE_CHAT,
            "caso": VERSION_DEL_PROMPT_DE_CASO,
            "relevancia": VERSION_DEL_PROMPT_DE_RELEVANCIA_DEL_CHAT,
        },
        "metricas": {
            "exactitud_de_intent": _razon(
                sum(c["intent_correcto"] for c in medidas.por_caso), len(medidas.por_caso)
            ),
            "por_tipo": _por_tipo(medidas),
            "salidas_prescriptivas": medidas.prescriptivas,
            "apariciones_de_identidad": {
                "estado_del_hilo": medidas.identidad_en_estado,
                "logs": medidas.identidad_en_logs,
            },
            "latencia": _latencia(medidas),
            "revision_clinica": _revision(dataset),
        },
        "control_prescriptivo": dict(medidas.control),
        "por_caso": medidas.por_caso,
    }


def codigo_de_salida(reporte: Mapping[str, Any]) -> int:
    """Solo RN-23 y la no fuga bloquean (AC-5, AC-6); la latencia es informativa (AC-7) y la revisión pendiente no bloquea (AC-8)."""
    metricas = reporte["metricas"]
    fuga = sum(metricas["apariciones_de_identidad"].values())
    return CODIGO_DE_FUGA_O_PRESCRIPTIVO if metricas["salidas_prescriptivas"] or fuga else 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evaluar-chat")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, default=raiz_repo() / DATASET_POR_DEFECTO)
    parser.add_argument("--peticiones", type=Path, default=None)
    parser.add_argument("--salida", type=Path, default=None)
    return parser


def main(argv: Sequence[str], *, entorno: Mapping[str, str] | None = None) -> int:
    args = _parser().parse_args(list(argv))
    try:
        config = cargar_config_suite(args.config)
        dataset = cargar_dataset_de_chat(args.dataset)
        if args.peticiones is not None:
            peticiones = cargar_peticiones(args.peticiones, config)
        elif config.proveedor == "fake":
            peticiones = peticiones_de_ejemplo(dataset, config)
        else:
            raise SuiteAbortada(
                "con modelos locales hacen falta --peticiones de eval:chat-preparar"
            )
        reporte = asyncio.run(
            evaluar(config, dataset, peticiones, puertos=_puertos_de(config, entorno))
        )
    except (DatasetInvalido, SuiteAbortada) as error:
        print(f"evaluar-chat: la suite no corre: {error}", file=sys.stderr)
        return 2
    texto = json.dumps(reporte, ensure_ascii=False, indent=2, sort_keys=True)
    if args.salida is not None:
        args.salida.mkdir(parents=True, exist_ok=True)
        (args.salida / "chat.json").write_text(texto + "\n", encoding="utf-8")
    print(texto)
    return codigo_de_salida(reporte)


def _puertos_de(config: ConfigSuite, entorno: Mapping[str, str] | None) -> PuertosDeChat:
    """Con ``proveedor: fake`` los bordes de la suite; con ``local``, los pesos y el LLM nativo de ADR-39 (RN-12)."""
    if config.proveedor != "local":
        return PuertosDeChat()
    raise SuiteAbortada("con modelos locales hacen falta los puertos locales")


if __name__ == "__main__":
    from app.evaluation.evaluate import entorno_del_proceso

    sys.exit(main(sys.argv[1:], entorno=entorno_del_proceso()))
