# Modo local — para revisar el sistema sin infraestructura

Levanta la app completa con los 908 registros del respaldo, sin Supabase, sin
Railway y sin Base44. Sirve para recorrer pantalla por pantalla y decidir qué
sobra y qué hay que mejorar.

```bash
npm install
npm run dev:local        # http://localhost:5180
```

`.env.local` ya trae `VITE_MODO=local`.

## Qué es real y qué no

| | |
|---|---|
| Los datos | **Reales.** Los 908 registros del respaldo del 31-08, en memoria |
| Las 21 funciones backend | **Reales.** Las mismas de `servidor/funciones/`, corriendo en el navegador |
| La navegación por rol | **Real.** Cambia según el usuario que elijas |
| Los permisos a nivel de datos (RLS) | **NO.** En local todos ven todo — ver abajo |
| Storage, correo, Google Drive | **NO.** Se registran en el panel, no se ejecutan |
| Persistencia | **Parcial.** Se guarda un diario de tus cambios, no el dataset |

Las mismas 21 funciones corren en los dos lados gracias al import `#compat`:
en Railway lo resuelve Node hacia Supabase, acá Vite lo resuelve hacia el
almacén en memoria. No hay una copia "de mentira" de la lógica.

## El panel LOCAL (arriba a la derecha)

- **Cambiar de usuario** entre los 18 reales. Recarga la página. La navegación
  y las funciones que consultan el rol responden de verdad.
- **Llamadas sin backend**: cada vez que una pantalla pide subir un archivo,
  mandar un correo o tocar Drive, aparece ahí. Es el inventario de qué pantalla
  depende de qué servicio externo.

## Empieza por el inicio de sesión

Sin cuenta elegida, el modo local arranca en la **pantalla de Bienvenida real**,
no te mete directo. El botón "Iniciar Sesión" abre un selector con las 22 cuentas
(18 reales + 4 de prueba). Eliges una y entras.

El control de acceso de Base44 —la aprobación por un administrador, el contador
de intentos y el bloqueo automático— **se quitó**: dependía de que cualquiera
pudiera registrarse solo con Google. Con Supabase Auth eso lo reemplaza la
propia lista de usuarios: estás invitado o no estás.

El panel LOCAL tiene **"Cerrar sesión"** para volver a la pantalla de inicio.

## Perfiles de prueba

Cuatro roles del sistema no tienen a nadie asignado en producción, así que no
había forma de revisarlos. En modo local existen estos usuarios ficticios
(`src/api/local/datos-prueba.json`, todos con `is_sample: true`):

| Perfil | Qué ve al entrar |
|---|---|
| `[PRUEBA] Ana Administradora` — admin | Gestión de usuarios y centros, aprobación de accesos |
| `[PRUEBA] Mario Mecánico` — mecanico | 3 órdenes asignadas: una Asignada, una En Proceso, una Pausada |
| `[PRUEBA] Carla Compras Taller` — encargado_compras_taller | 1 solicitud aprobada esperando compra, 3 repuestos, 2 proveedores |
| `[PRUEBA] Sofía Compras Salud` — encargado_compras_salud | 2 solicitudes de insumos médicos, una pendiente y una aprobada |

Se eligen desde el panel LOCAL como cualquier otro usuario. **No salen del
respaldo y no entran a la migración**: regenerar `datos.json` no los pisa, y
`migracion/02_datos.sql` no los incluye.

Al mecánico se le asignan las 3 órdenes abiertas más recientes, una en cada
estado de su flujo, para que la pantalla muestre algo en vez de aparecer vacía.

Sus 2 solicitudes de repuesto van a su nombre a propósito: **nadie puede aprobar
su propia solicitud**, y las 3 reales las creó el propio jefe de taller, así que
a él le aparecían 0 por aprobar.

## Los cambios se conservan

El respaldo (1,2 MB) vive solo en memoria, pero lo que creas o edites se guarda
en un diario en `localStorage` — unas pocas filas, no el dataset — y se reaplica
al recargar. Eso permite **seguir un flujo completo entre roles**: entras como
mecánico y pides un repuesto, cambias a jefe de taller y lo apruebas, cambias a
compras y ahí está.

El panel LOCAL tiene un botón **"Volver a los datos originales"** con la cuenta
de cambios guardados, para partir limpio cuando quieras.

## La advertencia importante

**No hay RLS en modo local.** `entities` y `asServiceRole.entities` son lo mismo,
así que cualquier usuario ve los 908 registros. Si entras como `encargado_salud`
y ves equipos de otro centro, es un artefacto de este modo, no un bug del
sistema — en producción las policies de `migracion/03_policies.sql` filtran.

Lo que sí puedes juzgar acá: qué pantallas existen, cuáles no aportan nada, qué
navegación ve cada rol, qué flujos están rotos o duplicados, y qué funciones
nadie llama.

## Volver al modo normal

Borra `.env.local` o corre `npm run dev` (sin `:local`).
