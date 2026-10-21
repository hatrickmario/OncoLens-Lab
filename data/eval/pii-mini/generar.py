"""Generador del dataset sintetico ``pii-mini`` (US-013, ADR-40; consume US-072, AC-6).

Materializa en memoria textos con PII sembrada y etiquetada por span y tipo desde ``plantillas.json``. Todo es
ficticio (RN-13, RN-14): los valores se generan al azar con una semilla fija y NUNCA se escriben en el repo en claro
(por eso el escaner de PII no los ve y no hace falta allowlist). Telefonos con numeracion de ficcion (NANP 555-01xx,
Ofcom 7700 900xxx), correos en ``example.test`` (RFC 2606), documentos al azar sin titular verificado.
Biblioteca estandar solamente; determinista (misma semilla, misma huella).

    python data/eval/pii-mini/generar.py --verificar    # comprueba las huellas del manifiesto (sin volcar valores)
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import sys
from pathlib import Path
from typing import Any

VERSION_GENERADOR = "1.0.0"
SEMILLA = 13
N_IDENTIDADES = 60
AQUI = Path(__file__).resolve().parent
PAISES = ("CO", "ES", "AR", "MX", "PE", "CL")
CONTEXTOS = ("pregunta", "nota", "evento", "atributo", "documento")

NOMBRES = (
    "Lucía", "Mateo", "Valentina", "Santiago", "Camila", "Andrés", "Sofía", "Javier", "Daniela", "Rafael",
    "Isabel", "Tomás", "Marta", "Esteban", "Paula", "Héctor", "Natalia", "Gonzalo", "Irene", "Emilio",
    "Carmen", "Ignacio", "Beatriz", "Fabián", "Alicia", "Ramiro", "Teresa", "Julián", "Pilar", "César",
)  # fmt: skip
APELLIDOS = (
    "Romero", "Vidal", "Navarro", "Cárdenas", "Ibarra", "Montoya", "Salazar", "Pardo", "Quintero", "Zamora",
    "Fuentes", "Barrios", "Cortés", "Domínguez", "Escobar", "Ferrer", "Galindo", "Herrera", "Lozano", "Mendoza",
    "Naranjo", "Olmos", "Paredes", "Rojas", "Sandoval", "Tapia", "Uribe", "Valdés", "Yepes", "Zuluaga",
)  # fmt: skip
CALLES = ("Los Almendros", "Las Acacias", "San Martín", "Del Prado", "Santa Rita", "La Esperanza", "Bolívar", "Los Robles")
BARRIOS = ("El Mirador", "La Floresta", "Villa Clara", "Altos del Sur", "San Cristóbal", "Prados del Norte")
MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)  # fmt: skip
OFCOM_FICCION = ("44", "7700", "900")
LETRAS_DNI = tuple("TRWAGMYFPDXBNJZSQVHLCKE")
LETRAS_CURP = tuple("ABCDEFGHJKLMNPRSTUVXYZ")
MARCADOR = re.compile(r"\{(\w+)\}")
ETIQUETA_DE_MARCADOR = {
    "nombre": "nombre",
    "representante": "nombre",
    "documento": "documento",
    "telefono": "telefono",
    "correo": "correo",
    "direccion": "direccion",
    "nacimiento": "fecha_nacimiento",
}

Identidad = dict[str, tuple[str, str]]


class _Azar:
    """Sobre ``random()`` (estable entre versiones de Python), no sobre ``randrange``/``choice``."""

    def __init__(self, semilla: int) -> None:
        self._rng = random.Random(semilla)

    def entero(self, minimo: int, maximo: int) -> int:
        return minimo + int(self._rng.random() * (maximo - minimo + 1))

    def elegir(self, opciones: tuple[str, ...]) -> str:
        return opciones[self.entero(0, len(opciones) - 1)]

    def digitos(self, n: int) -> str:
        return "".join(str(self.entero(0, 9)) for _ in range(n))


def _con_puntos(digitos: str) -> str:
    cabeza = len(digitos) % 3 or 3
    grupos = [digitos[:cabeza], *(digitos[i : i + 3] for i in range(cabeza, len(digitos), 3))]
    return ".".join(grupos)


def _documento(az: _Azar, pais: str) -> tuple[str, str]:
    """(palabra clave, valor) con el formato del pais."""
    if pais == "CO":
        return az.elegir(("CC ", "cedula ")), _con_puntos(f"1{az.digitos(9)}")
    if pais == "ES":
        return "DNI ", f"{az.digitos(8)}{az.elegir(LETRAS_DNI)}"
    if pais == "AR":
        return "DNI ", _con_puntos(az.digitos(8))
    if pais == "MX":
        cabeza = "".join(az.elegir(LETRAS_CURP) for _ in range(4)) + az.digitos(6) + az.elegir(("H", "M"))
        return "CURP ", cabeza + "".join(az.elegir(LETRAS_CURP) for _ in range(5)) + az.digitos(2)
    if pais == "PE":
        return "DNI ", az.digitos(8)
    return "RUT ", f"{_con_puntos(az.digitos(8))}-{az.elegir(tuple('0123456789K'))}"


def _telefono(az: _Azar) -> tuple[str, str]:
    ficticio = f"01{az.digitos(2)}"
    forma = az.entero(0, 4)
    if forma == 0:
        return "tel. ", f"555-{ficticio}"
    if forma == 1:
        return "celular ", f"555 {ficticio}"
    if forma == 2:
        return "", f"+1{az.entero(201, 989)}555{ficticio}"
    if forma == 3:
        return "", f"+1 {az.entero(201, 989)} 555 {ficticio}"
    return "", "+" + "".join(OFCOM_FICCION) + az.digitos(3)  # Ofcom: 07700 900xxx es numeracion de drama


def _direccion(az: _Azar) -> str:
    forma = az.entero(0, 3)
    numero, a, b = az.entero(1, 150), az.entero(1, 99), az.entero(1, 99)
    if forma == 0:
        return f"Calle {numero} # {a}-{b}, barrio {az.elegir(BARRIOS)}"
    if forma == 1:
        return f"Carrera {numero} No. {a}-{b}"
    if forma == 2:
        return f"Avenida {az.elegir(CALLES)} {numero}, piso {az.entero(1, 9)}"
    return f"Calle {az.elegir(CALLES)} {numero}, {az.entero(1, 9)} {az.elegir(('A', 'B', 'C'))}"


def _nacimiento(az: _Azar) -> str:
    anio, mes, dia = az.entero(1938, 2012), az.entero(1, 12), az.entero(1, 28)
    forma = az.entero(0, 2)
    if forma == 0:
        return f"{dia:02d}/{mes:02d}/{anio}"
    if forma == 1:
        return f"{anio}-{mes:02d}-{dia:02d}"
    return f"{dia} de {MESES[mes - 1]} de {anio}"


def _nombre(az: _Azar) -> str:
    primero = az.elegir(NOMBRES)
    segundo = az.elegir(tuple(n for n in NOMBRES if n != primero))
    return f"{primero}{' ' + segundo if az.entero(0, 2) == 0 else ''} {az.elegir(APELLIDOS)} {az.elegir(APELLIDOS)}"


def _identidad(az: _Azar, indice: int) -> Identidad:
    """Marcador -> (prefijo no etiquetado, valor etiquetado); el prefijo es la palabra clave del formato."""
    pais = PAISES[indice % len(PAISES)]
    nombre, representante = _nombre(az), _nombre(az)
    return {
        "pais": (pais, pais),
        "nombre": ("", nombre),
        "representante": ("", representante),
        "documento": _documento(az, pais),
        "telefono": _telefono(az),
        "correo": ("", f"{nombre.split()[0].lower()}.{az.digitos(4)}@example.test"),
        "direccion": ("", _direccion(az)),
        "nacimiento": ("", _nacimiento(az)),
    }


def _renderizar(plantilla: str, identidad: Identidad) -> tuple[str, list[dict[str, Any]]]:
    salida: list[str] = []
    etiquetas: list[dict[str, Any]] = []
    posicion, cursor = 0, 0
    for coincidencia in MARCADOR.finditer(plantilla):
        salida.append(plantilla[cursor : coincidencia.start()])
        posicion += coincidencia.start() - cursor
        prefijo, valor = identidad[coincidencia.group(1)]
        salida.append(prefijo + valor)
        inicio = posicion + len(prefijo)
        tipo = ETIQUETA_DE_MARCADOR[coincidencia.group(1)]
        etiquetas.append({"tipo": tipo, "inicio": inicio, "fin": inicio + len(valor)})
        posicion += len(prefijo) + len(valor)
        cursor = coincidencia.end()
    salida.append(plantilla[cursor:])
    return "".join(salida), etiquetas


def _controles(texto: str, terminos: list[str], criticos: set[str]) -> list[dict[str, Any]]:
    encontrados = [
        {"termino": t, "inicio": m.start(), "fin": m.end(), "critico": t in criticos}
        for t in terminos
        for m in re.finditer(re.escape(t), texto)
    ]
    return sorted(encontrados, key=lambda c: c["inicio"])


def cargar_plantillas(directorio: Path = AQUI) -> dict[str, Any]:
    datos: dict[str, Any] = json.loads((directorio / "plantillas.json").read_text(encoding="utf-8"))
    return datos


def materializar(
    semilla: int = SEMILLA, n_identidades: int = N_IDENTIDADES, directorio: Path = AQUI
) -> list[dict[str, Any]]:
    """Textos con ``etiquetas`` (PII sembrada) y ``controles`` (terminos clinicos que no son PII). Solo en memoria."""
    datos = cargar_plantillas(directorio)
    az = _Azar(semilla)
    criticos = set(datos["terminos_criticos"])
    textos: list[dict[str, Any]] = []
    for i in range(n_identidades):
        identidad = _identidad(az, i)
        for contexto in CONTEXTOS:
            candidatas = [p for p in datos["plantillas"] if p["contexto"] == contexto]
            plantilla = candidatas[i % len(candidatas)]
            texto, etiquetas = _renderizar(plantilla["texto"], identidad)
            textos.append(
                {
                    "id": f"{plantilla['id']}-{i:03d}",
                    "contexto": contexto,
                    "pais": identidad["pais"][1],
                    "texto": texto,
                    "etiquetas": etiquetas,
                    "controles": _controles(texto, datos["terminos_clinicos"], criticos),
                }
            )
    return textos


def huella(textos: list[dict[str, Any]]) -> str:
    canonico = json.dumps(textos, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def huella_de_plantillas(directorio: Path = AQUI) -> str:
    return hashlib.sha256((directorio / "plantillas.json").read_bytes()).hexdigest()


def main(argumentos: list[str]) -> int:
    if "--verificar" not in argumentos:
        print("uso: python generar.py --verificar", file=sys.stderr)
        return 2
    manifiesto = json.loads((AQUI / "manifest.json").read_text(encoding="utf-8"))
    corpus = materializar(manifiesto["semilla"], manifiesto["identidades"])
    coincide = (
        huella(corpus) == manifiesto["sha256_corpus"]
        and huella_de_plantillas() == manifiesto["sha256_plantillas"]
    )
    print("pii-mini: huellas coinciden" if coincide else "pii-mini: las huellas no coinciden")
    return 0 if coincide else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
