import { base44 } from "@/api/base44Client";

// Agrega un evento a la línea de tiempo de seguimiento de una SolicitudRepuesto.
// Lee el array actual, agrega el evento al final y persiste el resultado completo
// (el update del SDK reemplaza el array, por eso se reconstruye desde el valor
// más reciente en vez de apendar sobre un objeto stale).
export async function agregarEventoCompra(solicitudId, evento, notas, usuario, entityName = "SolicitudRepuesto") {
  const entity = base44.entities[entityName];
  const sol = await entity.get(solicitudId);
  const actual = Array.isArray(sol.linea_tiempo) ? sol.linea_tiempo : [];
  const nuevo = [
    ...actual,
    {
      fecha: new Date().toISOString(),
      evento,
      usuario_email: usuario?.email || "",
      usuario_nombre: usuario?.full_name || "",
      notas: notas || "",
    },
  ];
  await entity.update(solicitudId, { linea_tiempo: nuevo });
  return nuevo;
}