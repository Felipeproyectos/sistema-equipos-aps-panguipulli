// Traduce lo que contesta la base a algo que la persona pueda entender y hacer.
//
// Por que existe
// --------------
// Cuando Postgres o PostgREST rechazan una escritura, el mensaje viene escrito
// para un programador: «new row violates row-level security policy for table
// "equipo"». Eso, mostrado tal cual, no le sirve a nadie; y mostrado en ningun
// lado — que era lo que pasaba — es peor: la persona aprieta Guardar, no ocurre
// nada, y no tiene forma de saber por que.
//
// Se usa desde dos lugares:
//   1. src/api/base44Client.js, para avisar de CUALQUIER escritura que falle,
//      sin tener que acordarse pantalla por pantalla.
//   2. Los formularios que ademas quieren mostrarlo en su propio recuadro.

// El texto se arma con `que`, una descripcion corta de lo que se estaba
// haciendo ("guardar el equipo", "crear la solicitud"). Si no se pasa, queda
// una frase generica que igual se entiende.
export function mensajeDeError(err, que = "guardar los cambios") {
  const crudo = err?.message || String(err || "");

  // Los dos bloqueos que pone la propia aplicacion ya vienen redactados.
  if (/Simular Rol|solo lectura/i.test(crudo)) return crudo;

  if (/row-level security|violates row-level|42501|permission denied/i.test(crudo)) {
    return `Tu perfil no tiene permiso para ${que}. Si crees que debería tenerlo, avísale a Informática con este mensaje.`;
  }
  if (/invalid input syntax for type (date|timestamp)/i.test(crudo)) {
    return "Hay una fecha a medio escribir. Revísala o déjala en blanco.";
  }
  if (/invalid input syntax for type (numeric|integer|bigint)/i.test(crudo)) {
    return "Hay un campo que tiene que ser un número y trae otra cosa.";
  }
  if (/duplicate key|already exists|unique constraint/i.test(crudo)) {
    return "Ya existe un registro con ese dato único (un número de inventario, un correo o un código repetido).";
  }
  if (/violates foreign key|foreign key constraint/i.test(crudo)) {
    return "No se puede porque hay otros registros que dependen de este. Hay que resolver esos primero.";
  }
  if (/violates not-null|null value in column/i.test(crudo)) {
    const campo = crudo.match(/column "([^"]+)"/i);
    return `Falta un dato obligatorio${campo ? ` (${campo[1]})` : ""}.`;
  }
  const columna = crudo.match(/could not find the '([^']+)' column/i);
  if (columna) {
    return `El sistema mandó un dato que la base no tiene (${columna[1]}). Es un error del sistema, no tuyo: avísale a Informática.`;
  }
  if (/JWT|not authenticated|Unauthorized|401/i.test(crudo)) {
    return "Tu sesión caducó. Cierra sesión, vuelve a entrar e inténtalo de nuevo.";
  }
  if (/Failed to fetch|NetworkError|network|ERR_INTERNET/i.test(crudo)) {
    return "No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.";
  }

  return `No se pudo ${que}: ${crudo}`;
}

// De `Equipo.create` / `functions.invoke('gestionarAcceso')` a algo legible,
// para poder decir QUE fallo sin que cada pantalla tenga que declararlo.
const NOMBRES = {
  Equipo: "el equipo", Parche: "el parche", OrdenTrabajo: "la orden de trabajo",
  Solicitud: "la solicitud", SolicitudRepuesto: "la solicitud de repuesto",
  SolicitudRepuestoSalud: "la solicitud de insumo", SolicitudStock: "la solicitud de stock",
  Alerta: "la alerta", Actividad: "la actividad", Comentario: "el comentario",
  Repuesto: "el repuesto", Proveedor: "el proveedor", Centro: "el centro",
  User: "la ficha del usuario", OrdenDeCompra: "la orden de compra",
  Kilometraje: "el kilometraje", InspeccionPendiente: "la inspección",
  ConfigAlerta: "la configuración de alertas", AppConfig: "la configuración",
  ConsumoRepuesto: "el consumo de repuesto", InvitacionPendiente: "la invitación",
};

const VERBOS = { create: "crear", update: "guardar", delete: "eliminar" };

export function queSeEstabaHaciendo(entidad, metodo) {
  const nombre = NOMBRES[entidad];
  const verbo = VERBOS[metodo];
  if (nombre && verbo) return `${verbo} ${nombre}`;
  return "guardar los cambios";
}

// ponytail: si esto se rompe, los avisos vuelven a ser jerga de base de datos.
export function _selfCheck() {
  const rls = mensajeDeError(new Error('new row violates row-level security policy for table "equipo"'), "crear el equipo");
  console.assert(rls.includes("no tiene permiso para crear el equipo") && !rls.includes("row-level"), "rls", rls);
  console.assert(mensajeDeError(new Error('invalid input syntax for type date: ""')).includes("fecha"), "fecha");
  console.assert(mensajeDeError(new Error("duplicate key value")).includes("Ya existe"), "duplicado");
  console.assert(mensajeDeError(new Error("Simular Rol activo")) === "Simular Rol activo", "no se reescribe lo ya redactado");
  console.assert(queSeEstabaHaciendo("Equipo", "create") === "crear el equipo", "descripcion");
  console.assert(queSeEstabaHaciendo("NoExiste", "create") === "guardar los cambios", "descripcion por defecto");
}
