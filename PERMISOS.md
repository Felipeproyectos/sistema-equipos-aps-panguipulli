# Decisiones de permiso

La migración mueve el sistema **sin cambiar quién ve qué**. Todo lo que aparece
abajo está **apagado**: se comporta igual que en Base44.

Cada una salió de recorrer los perfiles en modo local. Ninguna es obligatoria —
son decisiones tuyas. Enciéndelas cuando quieras, de a una.

---

## 1. Monitor Corporativo sin poder crear ni editar

**Hoy (apagado):** llega a `/Equipos2` escribiendo la URL y ve el botón "Nuevo
Equipo". La base sí lo rechaza (`equipo_create` exige super_admin / admin /
encargado_salud), así que el error aparece recién al guardar.

**Encendido:** el cliente le bloquea toda escritura de entidades. Los comentarios
siguen permitidos — es su única escritura en el diseño de roles.

**Dónde:** `src/lib/permisos.js` → `monitorSoloLectura: true`

**Pendiente si lo enciendes:** el botón sigue visible, solo deja de funcionar.
Ocultarlo es un cambio aparte, por pantalla.

---

## 2. Compra directa solo para el Jefe de Taller

**Hoy (apagado):** el mecánico también puede registrar una compra directa —
precio, proveedor y boleta obligatoria. Es un movimiento de plata.

**Encendido:** el botón "Compra" desaparece para el mecánico. Él sigue pudiendo
agregar repuestos a la OT y solicitarlos.

**Dónde:** `src/lib/permisos.js` → `compraDirectaSoloJefe: true`

**A favor de encenderlo:** el diseño de roles lo pone en el Jefe de Taller, y el
propio código dice *"el mecánico NO puede cerrar la OT con costos"*.
**A favor de dejarlo:** si en la práctica el mecánico compra y le reembolsan.

---

## 3. Inspecciones solo del propio centro

**Hoy (apagado):** cualquier `encargado_salud` lee las **259** inspecciones, de
todos los centros, y puede **aprobar** las de cualquiera. Uno de Coñaripe puede
resolver las de Panguipulli.

**Encendido:** cada uno ve y aprueba solo las suyas.

| Centro | Inspecciones que vería |
|---|---|
| CESFAM Coñaripe | 145 |
| CESFAM Panguipulli | 110 |
| CESFAM Choshuenco | 1 |

**Dónde — son dos, y van juntas:**
- Lectura: `migracion/generar_sql.py` → `RESTRINGIR_INSPECCIONES_POR_CENTRO = True`,
  y regenerar el SQL.
- Aprobación: variable de entorno `RESTRINGIR_INSPECCIONES_POR_CENTRO=true` en Railway.

Si enciendes solo una, la lectura queda restringida pero la aprobación no.

**Ojo:** la pantalla de Revisión de Bitácora **ya filtra por centro en el código**,
independiente de esto. Encender esto cierra las otras dos capas — la base y la
función — que hoy están abiertas.

---

## Lo que NO es una decisión y sí quedó aplicado

Estos no cambian permisos: arreglan cosas que estaban rotas.

**`actividad_read`** — la regla de Base44 exigía `centro_origen = mi centro`, pero
`centro_origen` está vacío en las 205 actividades: es el origen de un *traslado*,
no el dueño del registro, y no hay traslados. La condición nunca se cumplía. **5 de
los 9 encargados veían 0 actividades.** Ahora el centro se resuelve por el equipo.
Esto **abre**, no restringe.

**Revisión de Bitácora cargaba solo 100 de 259 registros** ordenados por fecha. Las
pendientes son las viejas: **50 de las 52 eran inalcanzables** desde abril. Ahora
carga por estado.

**`aprobarInspeccion` devolvía 500 en toda aprobación** — `otCreada` declarada
dentro del `if` y usada fuera. El trabajo se hacía, el usuario veía un error.

---

## Verificar que no se pierde nada

```bash
python migracion/verificar_migracion.py backup-sistema.json
```

Compara el respaldo contra `02_datos.sql` fila por fila e id por id. Hoy:
**908 de 908**.
