# API de integración — guía para el sistema que envía

Para que otro sistema **entregue información** a Gestión de Equipos APS:

| Recurso | Qué recibe | Dónde se ve |
|---|---|---|
| `POST /api/v1/cargas-combustible` | Cargas de combustible (p. ej. desde la tarjeta de combustible) | Unidad de Control → Combustible, marcadas «Recibida por API» |
| `POST /api/v1/lecturas-odometro` | Kilometraje del GPS | «Último km» en las fichas de la flota (Unidad de Control) |
| `POST /api/v1/pagos-vehiculos` | Permisos de circulación, revisión técnica, SOAP, TAG, multas… | Unidad de Control → Pagos, y vencimientos de cada vehículo |

El contrato completo, con cada campo, sus límites y ejemplos, está en
**`GET /api/v1/openapi.json`** (se abre en Swagger Editor, Postman o Insomnia).
Lo genera el mismo código que valida: no puede quedar desactualizado.

---

## 1. La clave

La crea **Base del Sistema** en *Configuración → API de integración*. Cada
sistema externo tiene la suya y dice:

- **qué puede enviar** (alcances: `combustible:escribir`, `odometro:escribir`, `pagos:escribir`);
- **de qué centros**: solo puede informar vehículos de esos centros;
- **cuántas llamadas por minuto** (10 a 600; 60 por defecto);
- **hasta cuándo sirve** (máximo un año; se renueva con «Nueva clave»).

La clave se ve **una sola vez**, al crearla. El servidor guarda solo su hash.
Se envía en cada llamada:

```
Authorization: Bearer aps_xxxxxxxxxxxx_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

Nunca en la URL. Solo por **HTTPS**: una llamada por HTTP se rechaza aunque la
clave sea correcta (y esa clave hay que darla por expuesta: pedir una nueva).

Para comprobar que funciona:

```bash
curl -s https://SERVIDOR/api/v1/yo -H "Authorization: Bearer $CLAVE"
```

## 2. Las patentes

Los vehículos se identifican por **patente**. Se ignoran guiones, puntos,
espacios y mayúsculas (`ab-cd 12` = `ABCD12`). Las que se pueden usar:

```bash
curl -s https://SERVIDOR/api/v1/vehiculos -H "Authorization: Bearer $CLAVE"
```

## 3. Enviar registros

Siempre la misma forma: `{"registros": [ ... ]}`, entre 1 y 200 por llamada,
cuerpo de hasta 1 MB, `Content-Type: application/json`.

```bash
curl -s -X POST https://SERVIDOR/api/v1/cargas-combustible \
  -H "Authorization: Bearer $CLAVE" -H "Content-Type: application/json" \
  -d '{"registros":[{"id_externo":"COPEC-2026-000123","patente":"AB-CD-12","fecha":"2026-10-30","hora":"14:05","litros":45.2,"monto":52000,"km":105230,"tipo_combustible":"diesel","medio_pago":"tarjeta_combustible","tarjeta":"7001234567891234","estacion":"Copec Panguipulli Centro"}]}'
```

```bash
curl -s -X POST https://SERVIDOR/api/v1/lecturas-odometro \
  -H "Authorization: Bearer $CLAVE" -H "Content-Type: application/json" \
  -d '{"registros":[{"id_externo":"GPS-AB-CD-12-20261030","patente":"AB-CD-12","km":105480,"fecha_lectura":"2026-10-30T20:00:00-03:00"}]}'
```

```bash
curl -s -X POST https://SERVIDOR/api/v1/pagos-vehiculos \
  -H "Authorization: Bearer $CLAVE" -H "Content-Type: application/json" \
  -d '{"registros":[{"id_externo":"PC-2027-AB-CD-12","patente":"AB-CD-12","tipo":"permiso_circulacion","monto":98500,"fecha_pago":"2026-03-28","vigencia_desde":"2026-04-01","vigencia_hasta":"2027-03-31"}]}'
```

### La respuesta

Cada registro se responde por separado, en el mismo orden (`indice`). Uno
malo no impide que entren los demás.

```json
{
  "resumen": { "recibidos": 3, "creados": 1, "duplicados": 1, "rechazados": 1 },
  "resultados": [
    { "indice": 0, "id_externo": "A-1", "estado": "creado", "id": "…" },
    { "indice": 1, "id_externo": "A-2", "estado": "duplicado", "id": "…" },
    { "indice": 2, "id_externo": "A-3", "estado": "rechazado",
      "errores": ["El kilometraje (100) es menor que el de una carga anterior de este vehículo (105230)."] }
  ]
}
```

| HTTP | Significa |
|---|---|
| `200` | Todos entraron, o ya estaban (`duplicado`) |
| `207` | Una parte se rechazó: revisar `resultados[].errores` |
| `422` | Ninguno entró: revisar `resultados[].errores` |

Un rechazo con `"reintentable": true` fue un problema del servidor: se puede
reenviar tal cual. Los demás no van a entrar hasta que se corrija el dato.

### `id_externo`: reenviar no duplica

Cada registro lleva el identificador que tiene en el sistema que lo envía. Un
mismo `id_externo` del mismo acceso entra **una sola vez**: si se reenvía,
responde `duplicado` (no lo modifica). Ante un corte de red o un `5xx`, se
puede reenviar el lote completo sin miedo.

Para las lecturas del GPS sirve algo como `GPS-<patente>-<AAAAMMDD>`. Con una
lectura por vehículo al día (al cierre de la jornada) alcanza.

### Lo que la base revisa además

Son las mismas reglas que un registro hecho en pantalla:

- **Combustible**: litros entre 0 y 1.000; `monto` o `precio_litro`; fecha no
  futura; el `km` no puede ser menor que el de una carga anterior del mismo
  vehículo. El centro que paga lo calcula el sistema (considera préstamos).
  De `tarjeta` se guardan solo los 4 últimos dígitos.
- **Odómetro**: no retrocede: ni menos que una lectura anterior, ni más que
  una posterior del mismo vehículo. Dentro de un lote se guardan en orden de
  fecha, así que pueden venir desordenadas.
- **Pagos**: pagado ⇒ `fecha_pago`; pendiente ⇒ `vence_pago`; permiso de
  circulación, revisión técnica y SOAP ⇒ `vigencia_hasta`; `tipo: "otro"` ⇒
  `categoria_otro`; `rut_proveedor` con dígito verificador válido.

Un campo que no está en el contrato **se rechaza**, no se ignora.

## 4. Consultar lo enviado

```bash
curl -s https://SERVIDOR/api/v1/cargas-combustible/COPEC-2026-000123 -H "Authorization: Bearer $CLAVE"
```

Devuelve el registro si lo envió este mismo acceso. Si la Unidad de Control lo
anuló, `estado` es `"anulado"` con su `motivo_anulacion`. La API no modifica ni
anula: un registro mal enviado lo anula la Unidad de Control, y el correcto se
envía con otro `id_externo`.

## 5. Errores

Siempre con la misma forma:

```json
{ "error": { "codigo": "clave_vencida", "mensaje": "Este acceso venció. …" } }
```

| HTTP | `codigo` | Qué hacer |
|---|---|---|
| 400 | `json_invalido`, `cuerpo_invalido`, `parametro_invalido` | Corregir la llamada |
| 401 | `no_autenticado`, `clave_invalida` | Revisar la cabecera `Authorization` |
| 401 | `clave_revocada`, `clave_vencida` | Pedir una clave nueva |
| 403 | `alcance_insuficiente` | Esa clave no puede enviar ese recurso |
| 403 | `https_requerido` | Llamar por HTTPS (y pedir clave nueva) |
| 404 | `recurso_desconocido`, `no_encontrado`, `ruta_desconocida` | |
| 405 | `metodo_no_permitido` | Ver la cabecera `Allow` |
| 413 | `cuerpo_demasiado_grande` | Lotes más chicos |
| 415 | `tipo_no_soportado` | `Content-Type: application/json` |
| 429 | `demasiadas_solicitudes`, `demasiados_intentos` | Esperar lo que diga `Retry-After` |
| 500 | `error_interno` | Reintentar; si sigue, informar `solicitud_id` |
| 503 | `api_no_configurada` | Avisar al administrador del sistema |

Cada respuesta trae `X-Request-Id` y, con clave válida, `RateLimit-Limit`,
`RateLimit-Remaining` y `RateLimit-Reset`.

---

## Para quien administra el sistema

**Instalar**: correr `migracion/34_api_integracion.sql` en Supabase y poner
`API_CLAVES_PEPPER` en Railway (ver `DESPLIEGUE.md`).

**Qué queda registrado**:

- cada llamada, aceptada o no, en `api_registro` (quién, ruta, resultado,
  cuántos registros, IP, duración). Se ve en *Configuración → API de
  integración → Actividad*. Se purga sola a los `API_REGISTRO_DIAS` (180);
- crear, rotar y revocar accesos, en Auditoría;
- cada carga y pago que entra, en Auditoría, como cualquier otro.

**Si una clave se filtra**: *Nueva clave* (la anterior deja de servir en el
acto) o *Revocar* (para siempre).

**Si `API_CLAVES_PEPPER` cambia**, todas las claves dejan de servir: hay que
rotarlas todas. No se cambia salvo que se haya filtrado.

**Límites conocidos**: el límite por minuto y el bloqueo por intentos fallidos
se cuentan en la memoria del servidor; si Railway corre más de una instancia,
cada una cuenta por su lado.
