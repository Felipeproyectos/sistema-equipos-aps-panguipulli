import { createClientFromRequest } from '#compat';
import {
  estadoDeVehiculos, tramosDelDia, ultimoKm, fallasDePauta, pautaCompleta,
  esVehiculoDeFlota, rotuloVehiculo, hoyChile, horaChile,
} from '../compartido/turnoFlota.js';

// El turno del chofer (migracion/25_turno_chofer.sql): el chofer toma el
// vehículo al hacer la pauta de inicio, lo entrega al terminar, y puede
// cambiar de vehículo en el día. Movilización ya no asigna: supervisa, y
// puede liberar un vehículo que alguien dejó sin entregar.
//
// El chofer no escribe directo en uso_vehiculo: pasa por acá, que valida lo
// que una policy no sabe expresar (que el vehículo esté disponible, quién lo
// tenía, si la pauta trae fallas). La licencia y "uno abierto a la vez" los
// vuelve a exigir la base, aunque esto fallara.
//
// Acciones:
//   estado    lo que ve el chofer en «Mi turno»: su licencia, lo que tiene a
//             cargo, sus tramos del día y en qué está cada vehículo
//   tomar     abre un uso (y cierra el anterior si cambia de vehículo, o el
//             de otro chofer si se lo entregó)
//   entregar  cierra su uso abierto
//   liberar   Movilización cierra el uso de otro (lo dejó sin entregar)

const ROLES_CHOFER = ['chofer', 'super_admin'];
const ROLES_SUPERVISAN = ['super_admin', 'admin', 'encargado_movilizacion'];

const error = (mensaje, status = 400, extra = {}) => Response.json({ error: mensaje, ...extra }, { status });

const numero = (v) => (v === '' || v == null ? null : Number(v));
const kmValido = (v) => v != null && Number.isFinite(v) && v >= 0 && v < 5000000;

function licenciaVigente(user, hoy) {
  return !!user?.licencia_vencimiento && String(user.licencia_vencimiento).slice(0, 10) >= hoy;
}

async function cargarFlota(db) {
  const [equipos, usos, ordenes, reservas, prestamos, bitacora, kilometrajes] = await Promise.all([
    db.Equipo.list('-updated_date', 1000),
    db.UsoVehiculo.list('-inicio', 1500).catch(() => []),
    db.OrdenTrabajo.list('-created_date', 1000).catch(() => []),
    db.AsignacionChofer.filter({ estado: 'activa' }, '-desde', 1000).catch(() => []),
    db.PrestamoVehiculo.filter({ estado: 'vigente' }, '-desde', 500).catch(() => []),
    db.BitacoraFlota.list('-fecha', 1500).catch(() => []),
    db.Kilometraje.list('-fecha', 1500).catch(() => []),
  ]);
  return { equipos, usos, ordenes, reservas, prestamos, bitacora, kilometrajes };
}

async function abrirSolicitud(db, { equipo, user, hoy, texto }) {
  return db.Solicitud.create({
    equipo_id: equipo.id,
    tipo: 'mantenimiento_correctivo',
    fecha: hoy,
    usuario_email: user.email || '',
    usuario_nombre: user.full_name || user.email || 'Chofer',
    centro: equipo.centro_principal || '',
    estado: 'pendiente',
    origen: 'pauta_chofer',
    observaciones: texto,
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return error('Unauthorized', 401);
    const db = base44.asServiceRole.entities;
    const datos = await req.json().catch(() => ({}));
    const accion = datos.accion || 'estado';
    const hoy = hoyChile();
    const nombre = user.full_name || user.email || 'Chofer';

    // ── estado ───────────────────────────────────────────────────────
    if (accion === 'estado') {
      if (!ROLES_CHOFER.includes(user.role)) return error('Solo para choferes', 403);
      const f = await cargarFlota(db);
      const estados = estadoDeVehiculos({
        vehiculos: f.equipos, usos: f.usos, ordenes: f.ordenes,
        reservas: f.reservas, prestamos: f.prestamos, choferId: user.id, hoy,
      });
      const actual = f.usos.find(u => u.chofer_id === user.id && u.estado === 'en_uso') || null;
      return Response.json({
        ok: true,
        hoy,
        yo: {
          id: user.id, nombre,
          licencia_vencimiento: user.licencia_vencimiento || null,
          licencia_clase: user.licencia_clase || null,
          licencia_vigente: licenciaVigente(user, hoy),
        },
        actual,
        tramos: tramosDelDia(f.usos, user.id, hoy),
        reservas_mias: f.reservas
          .filter(r => r.chofer_id === user.id && (!r.hasta || r.hasta >= hoy))
          .sort((a, b) => String(a.desde).localeCompare(String(b.desde)))
          .slice(0, 5),
        vehiculos: estados.map(e => ({
          id: e.vehiculo.id,
          label: rotuloVehiculo(e.vehiculo),
          marca: e.vehiculo.marca, modelo: e.vehiculo.modelo, patente: e.vehiculo.patente,
          tipo: e.vehiculo.tipo,
          centro: e.vehiculo.centro_principal || '',
          estado: e.estado,
          // De los usos de otros solo se cuenta quién y desde cuándo.
          uso: e.uso ? { id: e.uso.id, chofer_id: e.uso.chofer_id, chofer_nombre: e.uso.chofer_nombre, inicio: e.uso.inicio } : null,
          taller: e.taller ? { numero_ot: e.taller.numero_ot || '' } : null,
          reserva: e.reserva ? {
            para_mi: e.reserva.chofer_id === user.id,
            chofer_nombre: e.reserva.chofer_nombre || '',
            hora_salida: e.reserva.hora_salida || '',
            destino: e.reserva.destino || '',
            desde: e.reserva.desde, hasta: e.reserva.hasta || null,
          } : null,
          prestamo: e.prestamo ? { centro_destino: e.prestamo.centro_destino || '' } : null,
          ultimo_km: ultimoKm(e.vehiculo.id, f),
        })),
      });
    }

    // ── tomar ────────────────────────────────────────────────────────
    if (accion === 'tomar') {
      if (!ROLES_CHOFER.includes(user.role)) return error('Solo los choferes toman vehículos', 403);
      const f = await cargarFlota(db);
      const equipo = f.equipos.find(e => e.id === datos.equipo_id);
      if (!esVehiculoDeFlota(equipo)) return error('Ese vehículo no existe o fue dado de baja', 404);
      const etiqueta = rotuloVehiculo(equipo);

      if (!licenciaVigente(user, hoy)) {
        await db.UsoVehiculo.create({
          equipo_id: equipo.id, equipo_label: etiqueta, equipo_tipo: equipo.tipo,
          chofer_id: user.id, chofer_email: user.email || '', chofer_nombre: nombre,
          estado: 'rechazado', inicio: new Date().toISOString(), fecha: hoy,
          motivo_rechazo: user.licencia_vencimiento ? 'Licencia vencida' : 'Licencia sin cargar',
        }).catch(() => null);
        return error(user.licencia_vencimiento
          ? 'Tu licencia de conducir está vencida: no puedes tomar vehículos. Renuévala y cárgala en «Mi licencia».'
          : 'Todavía no cargas tu licencia de conducir. Hazlo en «Mi licencia» para poder tomar vehículos.', 403);
      }

      const [estadoEq] = estadoDeVehiculos({
        vehiculos: [equipo], usos: f.usos, ordenes: f.ordenes,
        reservas: f.reservas, prestamos: f.prestamos, choferId: user.id, hoy,
      });
      if (estadoEq.estado === 'fuera_servicio') return error(`${etiqueta} está fuera de servicio.`);
      if (estadoEq.estado === 'taller') return error(`${etiqueta} está en el taller${estadoEq.taller?.numero_ot ? ` (${estadoEq.taller.numero_ot})` : ''}.`);

      const mio = f.usos.find(u => u.chofer_id === user.id && u.estado === 'en_uso') || null;
      if (mio && mio.equipo_id === equipo.id) return Response.json({ ok: true, uso: mio, ya_lo_tenias: true });

      const kmInicio = numero(datos.km_inicio);
      if (!kmValido(kmInicio)) return error('Indica el kilometraje con que lo tomas.');

      const esAmbulancia = equipo.tipo === 'ambulancia';
      if (esAmbulancia && !datos.inspeccion_id) return error('Falta la Pauta Diaria de inicio de la ambulancia.');
      if (!esAmbulancia && !pautaCompleta(datos.pauta)) return error('Completa la revisión rápida de la pauta de inicio.');

      const otro = f.usos.find(u => u.equipo_id === equipo.id && u.estado === 'en_uso' && u.chofer_id !== user.id) || null;
      if (otro && !datos.relevo) {
        return error(`${etiqueta} la tiene ${otro.chofer_nombre || 'otro chofer'} desde las ${horaChile(otro.inicio)}.`, 409,
          { ocupado_por: { chofer_nombre: otro.chofer_nombre, inicio: otro.inicio } });
      }

      // Cambio de vehículo: primero se entrega el que tenía.
      if (mio) {
        const kmFin = numero(datos.anterior?.km_fin);
        if (!kmValido(kmFin)) return error(`Para cambiar de vehículo, indica con qué kilometraje entregas ${mio.equipo_label || 'el anterior'}.`);
        if (mio.km_inicio != null && kmFin < Number(mio.km_inicio)) {
          return error(`El kilometraje de entrega (${kmFin}) no puede ser menor que el de inicio (${mio.km_inicio}).`);
        }
        await db.UsoVehiculo.update(mio.id, {
          estado: 'entregado', fin: new Date().toISOString(), cerrado_por: 'chofer',
          km_fin: kmFin,
          combustible_fin: String(datos.anterior?.combustible_fin || ''),
          motivo_cambio: String(datos.anterior?.motivo || '').slice(0, 200),
          observaciones_fin: String(datos.anterior?.observaciones || '').slice(0, 1000),
        });
      }

      // "Me lo entregó": se cierra el uso del otro chofer.
      if (otro) {
        await db.UsoVehiculo.update(otro.id, {
          estado: 'entregado', fin: new Date().toISOString(), cerrado_por: 'relevo', relevado_por: nombre,
          ...(otro.km_inicio == null || kmInicio >= Number(otro.km_inicio) ? { km_fin: kmInicio } : {}),
          observaciones_fin: `Lo tomó ${nombre} (marcó «me lo entregó»).`,
        });
      }

      const fallas = esAmbulancia ? [] : fallasDePauta(datos.pauta);
      const uso = await db.UsoVehiculo.create({
        equipo_id: equipo.id, equipo_label: etiqueta, equipo_tipo: equipo.tipo,
        chofer_id: user.id, chofer_email: user.email || '', chofer_nombre: nombre,
        estado: 'en_uso', inicio: new Date().toISOString(), fecha: hoy,
        km_inicio: kmInicio,
        combustible_inicio: String(datos.combustible || ''),
        pauta_inicio: esAmbulancia ? null : datos.pauta,
        pauta_con_falla: esAmbulancia ? !!datos.pauta_con_falla : fallas.length > 0,
        inspeccion_id: esAmbulancia ? String(datos.inspeccion_id) : null,
        observaciones_inicio: String(datos.observaciones || '').slice(0, 1000),
      });

      // La falla llega a Movilización como cualquier otra, en Solicitudes al Taller.
      let solicitud = null;
      if (fallas.length) {
        const detalle = fallas.map(x => `${x.label}${x.obs ? `: ${x.obs}` : ''}`).join('; ');
        solicitud = await abrirSolicitud(db, {
          equipo, user, hoy,
          texto: `Pauta de inicio (${nombre}, km ${kmInicio}): ${detalle}.${datos.observaciones ? ` ${String(datos.observaciones).slice(0, 500)}` : ''}`,
        }).catch(() => null);
        if (solicitud) await db.UsoVehiculo.update(uso.id, { solicitud_id: solicitud.id }).catch(() => null);
      }

      return Response.json({ ok: true, uso: { ...uso, solicitud_id: solicitud?.id || null }, solicitud_creada: !!solicitud, relevo: !!otro });
    }

    // ── entregar ─────────────────────────────────────────────────────
    if (accion === 'entregar') {
      if (!ROLES_CHOFER.includes(user.role)) return error('Solo para choferes', 403);
      const abiertos = await db.UsoVehiculo.filter({ chofer_id: user.id, estado: 'en_uso' }, '-inicio', 5);
      const mio = abiertos[0];
      if (!mio) return error('No tienes ningún vehículo a cargo.', 404);
      const kmFin = numero(datos.km_fin);
      if (!kmValido(kmFin)) return error('Indica el kilometraje con que lo entregas.');
      if (mio.km_inicio != null && kmFin < Number(mio.km_inicio)) {
        return error(`El kilometraje de entrega (${kmFin}) no puede ser menor que el de inicio (${mio.km_inicio}).`);
      }
      const actualizado = await db.UsoVehiculo.update(mio.id, {
        estado: 'entregado', fin: new Date().toISOString(), cerrado_por: 'chofer',
        km_fin: kmFin,
        combustible_fin: String(datos.combustible_fin || ''),
        observaciones_fin: String(datos.observaciones || '').slice(0, 1000),
      });
      let solicitud = null;
      const reporte = String(datos.reporte || '').trim();
      if (reporte) {
        const equipo = await db.Equipo.get(mio.equipo_id).catch(() => null);
        if (equipo) {
          solicitud = await abrirSolicitud(db, {
            equipo, user, hoy, texto: `Al entregar (${nombre}, km ${kmFin}): ${reporte.slice(0, 800)}`,
          }).catch(() => null);
        }
      }
      return Response.json({ ok: true, uso: actualizado || { ...mio, estado: 'entregado' }, solicitud_creada: !!solicitud });
    }

    // ── liberar ──────────────────────────────────────────────────────
    if (accion === 'liberar') {
      if (!ROLES_SUPERVISAN.includes(user.role)) return error('Solo Movilización puede liberar un vehículo', 403);
      const uso = datos.uso_id ? await db.UsoVehiculo.get(datos.uso_id).catch(() => null) : null;
      if (!uso || uso.estado !== 'en_uso') return error('Ese uso ya no está abierto.', 404);
      const kmFin = numero(datos.km_fin);
      if (kmFin != null && (!kmValido(kmFin) || (uso.km_inicio != null && kmFin < Number(uso.km_inicio)))) {
        return error('El kilometraje no es válido.');
      }
      const actualizado = await db.UsoVehiculo.update(uso.id, {
        estado: 'entregado', fin: new Date().toISOString(), cerrado_por: 'movilizacion', relevado_por: nombre,
        ...(kmFin != null ? { km_fin: kmFin } : {}),
        observaciones_fin: `Liberado por ${nombre}${datos.nota ? `: ${String(datos.nota).slice(0, 500)}` : ''}.`,
      });
      return Response.json({ ok: true, uso: actualizado });
    }

    return error('Acción no reconocida');
  } catch (e) {
    // Si la base rechaza (licencia, uno abierto a la vez), el mensaje es legible.
    const m = String(e?.message || e);
    if (/uso_vehiculo_un_abierto_por_vehiculo/.test(m)) return error('Otro chofer acaba de tomar ese vehículo. Vuelve a cargar la lista.', 409);
    if (/uso_vehiculo_un_abierto_por_chofer/.test(m)) return error('Ya tienes un vehículo a cargo: entrégalo antes de tomar otro.', 409);
    return error(m, 500);
  }
}
