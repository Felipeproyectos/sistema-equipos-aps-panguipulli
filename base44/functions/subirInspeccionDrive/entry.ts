import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Helpers de Google Drive ──────────────────────────────────────────────────

async function obtenerOCrearCarpeta(nombre, parentId, token) {
  const query = `name='${nombre.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const { files } = await res.json();
  if (files && files.length > 0) return files[0].id;

  // Crear carpeta
  const crearRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const carpeta = await crearRes.json();
  return carpeta.id;
}

async function obtenerRootDriveId(token) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files/root?fields=id', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.id;
}

async function subirHtmlComoPDF(nombre, htmlContent, parentId, token) {
  // Subir como Google Doc (para que quede en Drive) con contenido HTML
  const metadata = JSON.stringify({ name: nombre, parents: [parentId], mimeType: 'application/vnd.google-apps.document' });
  const body = `--boundary\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--boundary\r\nContent-Type: text/html\r\n\r\n${htmlContent}\r\n--boundary--`;

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/related; boundary=boundary',
    },
    body,
  });
  return await uploadRes.json();
}

// ── Mapeos ───────────────────────────────────────────────────────────────────

const TIPO_FORMULARIO_LABEL = {
  inspeccion_semanal: 'Pauta Semanal',
  turno_chofer: 'Turno Chofer',
  inspeccion_diaria: 'Pauta Diaria',
  inspeccion_anual: 'Pauta Anual',
};

const TIPO_EQUIPO_CATEGORIA = {
  ambulancia: 'Ambulancias',
  dea: 'DEA',
  monitor_desfibrilador: 'Monitor Desfibrilador',
  monitor_multiparametros: 'Monitor Multiparametros',
};

// Mapeo de nombres de centro a nombre oficial de carpeta
const ESTABLECIMIENTO_CARPETA = {
  'panguipulli':    'Cesfam Panguipulli',
  'choshuenco':     'Cesfam Choshuenco',
  'coñaripe':       'Cesfam Coñaripe',
  'conaripe':       'Cesfam Coñaripe',
};

function normalizarEstablecimiento(nombre) {
  if (!nombre) return nombre;
  const lower = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, val] of Object.entries(ESTABLECIMIENTO_CARPETA)) {
    if (lower.includes(key.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) return val;
  }
  return nombre; // fallback: usar el nombre tal cual
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Generadores de HTML profesional ─────────────────────────────────────────

function formatFecha(str) {
  if (!str) return '-';
  return str.split('-').reverse().join('/');
}

function ahora() {
  return new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' });
}

function estilosBase() {
  return `<style>
    @page { margin: 24mm 20mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a202c; margin: 0; padding: 0; }

    /* ── Encabezado ── */
    .header { background: #1d4ed8; color: white; padding: 18px 24px 14px; border-radius: 0 0 6px 6px; margin-bottom: 20px; }
    .header-title { font-size: 20px; font-weight: bold; letter-spacing: 0.5px; margin: 0 0 2px 0; }
    .header-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .header-meta { display: flex; gap: 32px; margin-top: 10px; font-size: 11px; opacity: 0.9; }

    /* ── Tarjetas de responsables ── */
    .resp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
    .resp-card { border-radius: 6px; padding: 12px 14px; }
    .resp-card.realizador { background: #eff6ff; border: 1px solid #bfdbfe; }
    .resp-card.aprobador  { background: #f0fdf4; border: 1px solid #86efac; }
    .resp-card .rc-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; }
    .resp-card.realizador .rc-title { color: #1d4ed8; }
    .resp-card.aprobador  .rc-title { color: #16a34a; }
    .resp-card .rc-name { font-size: 13px; font-weight: bold; color: #111827; margin-bottom: 2px; }
    .resp-card .rc-detail { font-size: 11px; color: #6b7280; }

    /* ── Equipo info ── */
    .equipo-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; }
    .equipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .eq-row { display: flex; gap: 6px; align-items: baseline; }
    .eq-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; white-space: nowrap; }
    .eq-val { font-size: 12px; color: #1e293b; }

    /* ── Secciones ── */
    .section-title { font-size: 13px; font-weight: bold; color: #1d4ed8; margin: 18px 0 6px 0;
                     border-bottom: 2px solid #bfdbfe; padding-bottom: 4px; }

    /* ── Tablas de checklist ── */
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    thead th { background: #1e40af; color: white; padding: 6px 10px; font-size: 11px; text-align: left; }
    tbody td { padding: 5px 10px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
    tbody tr:nth-child(even) td { background: #f8fafc; }

    /* ── Badges ── */
    .badge { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 10px; font-weight: bold; }
    .b-ok    { background: #dcfce7; color: #166534; }
    .b-falla { background: #fee2e2; color: #991b1b; }
    .b-na    { background: #f1f5f9; color: #64748b; }

    /* ── Obs / notas ── */
    .obs-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px;
               font-size: 11px; color: #78350f; margin: 8px 0 14px 0; white-space: pre-wrap; }

    /* ── Daños ── */
    .dano-row { background: #fff7ed; border-left: 3px solid #fb923c; padding: 5px 10px; margin-bottom: 4px;
                font-size: 11px; color: #7c2d12; border-radius: 0 4px 4px 0; }

    /* ── Resumen resultado ── */
    .resultado-box { display: flex; align-items: center; gap: 10px; border-radius: 6px; padding: 12px 16px; margin-top: 20px; }
    .resultado-box.aprobado { background: #f0fdf4; border: 1.5px solid #86efac; }
    .resultado-box.observaciones { background: #fffbeb; border: 1.5px solid #fde68a; }
    .resultado-icon { font-size: 22px; }
    .resultado-texto { font-size: 11px; color: #374151; }
    .resultado-texto strong { font-size: 13px; display: block; color: #111827; margin-bottom: 2px; }

    /* ── Footer ── */
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px;
              font-size: 10px; color: #94a3b8; text-align: center; }
    .page-break { page-break-before: always; }
  </style>`;
}

function tarjetasResponsables(insp, revisor) {
  const fechaInsp = formatFecha(insp.fecha);
  const fechaRev  = formatFecha(insp.fecha_revision);
  const horaGen   = ahora();
  return `
  <div class="resp-grid">
    <div class="resp-card realizador">
      <div class="rc-title">Realizado por</div>
      <div class="rc-name">${insp.conductor || '—'}</div>
      <div class="rc-detail">Fecha de realización: <strong>${fechaInsp}</strong></div>
      ${insp.km_inicial ? `<div class="rc-detail">KM inicial: <strong>${Number(insp.km_inicial).toLocaleString('es-CL')}</strong></div>` : ''}
      ${insp.combustible ? `<div class="rc-detail">Combustible: <strong>${insp.combustible}</strong></div>` : ''}
    </div>
    <div class="resp-card aprobador">
      <div class="rc-title">Aprobado por</div>
      <div class="rc-name">${revisor.full_name || revisor.email}</div>
      <div class="rc-detail">Email: <strong>${revisor.email}</strong></div>
      <div class="rc-detail">Fecha de aprobación: <strong>${fechaRev}</strong></div>
      <div class="rc-detail">Registro generado: <strong>${horaGen}</strong></div>
    </div>
  </div>`;
}

function infoEquipo(equipo, insp) {
  const tipoLabel = TIPO_EQUIPO_CATEGORIA[equipo.tipo] || equipo.tipo || '-';
  return `
  <div class="equipo-card">
    <div class="equipo-grid">
      <div class="eq-row"><span class="eq-label">Equipo</span><span class="eq-val">${insp.equipo_label || insp.equipo_id || '-'}</span></div>
      <div class="eq-row"><span class="eq-label">Tipo</span><span class="eq-val">${tipoLabel}</span></div>
      <div class="eq-row"><span class="eq-label">Marca / Modelo</span><span class="eq-val">${equipo.marca || '-'} ${equipo.modelo || ''}</span></div>
      <div class="eq-row"><span class="eq-label">N° Serie</span><span class="eq-val">${equipo.numero_serie || '-'}</span></div>
      <div class="eq-row"><span class="eq-label">Establecimiento</span><span class="eq-val">${equipo.centro_principal || '-'}</span></div>
      ${equipo.subsede ? `<div class="eq-row"><span class="eq-label">Subsede</span><span class="eq-val">${equipo.subsede}</span></div>` : ''}
      ${equipo.patente ? `<div class="eq-row"><span class="eq-label">Patente</span><span class="eq-val">${equipo.patente}</span></div>` : ''}
      ${equipo.numero_inventario ? `<div class="eq-row"><span class="eq-label">N° Inventario</span><span class="eq-val">${equipo.numero_inventario}</span></div>` : ''}
    </div>
  </div>`;
}

function tablaChecklist(titulo, items, mapEstado) {
  if (!items || Object.keys(items).length === 0) return '';
  let html = `<div class="section-title">${titulo}</div>
  <table>
    <thead><tr><th style="width:50%">Ítem</th><th style="width:20%">Estado</th><th>Observación</th></tr></thead>
    <tbody>`;
  for (const [item, v] of Object.entries(items)) {
    const { badge, label } = mapEstado(v?.estado);
    html += `<tr>
      <td>${item}</td>
      <td><span class="badge ${badge}">${label}</span></td>
      <td>${v?.obs || '—'}</td>
    </tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function mapEstadoBueno(estado) {
  if (estado === 'bueno')  return { badge: 'b-ok',    label: 'OK' };
  if (estado === 'malo')   return { badge: 'b-falla', label: 'FALLA' };
  if (estado === 'n/a')    return { badge: 'b-na',    label: 'N/A' };
  return { badge: 'b-na', label: estado || '—' };
}

function mapEstadoCorrecto(estado) {
  if (estado === 'correcto')   return { badge: 'b-ok',    label: 'OK' };
  if (estado === 'incorrecto') return { badge: 'b-falla', label: 'FALLA' };
  if (estado === 'n/a')        return { badge: 'b-na',    label: 'N/A' };
  return { badge: 'b-na', label: estado || '—' };
}

function htmlInspeccion(insp, revisor) {
  const datos  = (() => { try { return insp.datos_json ? JSON.parse(insp.datos_json) : {}; } catch { return {}; } })();
  const equipo = datos.equipo || {};
  const tipoLabel = TIPO_FORMULARIO_LABEL[insp.tipo_formulario] || insp.tipo_formulario;

  // ── Contar fallas para el resumen ──
  let totalItems = 0, totalFallas = 0;
  function contarFallas(seccion, estadoFalla) {
    if (!datos[seccion]) return;
    for (const v of Object.values(datos[seccion])) {
      totalItems++;
      if (v?.estado === estadoFalla) totalFallas++;
    }
  }
  if (insp.tipo_formulario === 'inspeccion_semanal') {
    ['luces','motor','accesorios','documentos'].forEach(s => contarFallas(s, 'malo'));
  } else if (insp.tipo_formulario === 'inspeccion_diaria') {
    ['exterior','interior','equipo_medico','accesorios_diaria','saneamiento','documentacion'].forEach(s => contarFallas(s, 'incorrecto'));
  }

  const tieneObservaciones = totalFallas > 0 || (insp.observaciones && insp.observaciones.trim());

  let html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${tipoLabel}</title>${estilosBase()}</head><body>`;

  // ── Encabezado ──
  html += `<div class="header">
    <p class="header-title">${tipoLabel.toUpperCase()}</p>
    <p class="header-sub">${normalizarEstablecimiento(equipo.centro_principal) || equipo.centro_principal || 'Sistema de Gestión de Equipos'}</p>
    <div class="header-meta">
      <span>Fecha pauta: <strong>${formatFecha(insp.fecha)}</strong></span>
      <span>Tipo equipo: <strong>${TIPO_EQUIPO_CATEGORIA[equipo.tipo] || equipo.tipo || '-'}</strong></span>
      ${equipo.patente ? `<span>Patente: <strong>${equipo.patente}</strong></span>` : ''}
    </div>
  </div>`;

  // ── Responsables ──
  html += tarjetasResponsables(insp, revisor);

  // ── Info equipo ──
  html += `<div class="section-title">Datos del Equipo</div>`;
  html += infoEquipo(equipo, insp);

  // ── Checklists según tipo ──
  if (insp.tipo_formulario === 'inspeccion_semanal') {
    html += tablaChecklist('Luces', datos.luces, mapEstadoBueno);
    html += tablaChecklist('Motor', datos.motor, mapEstadoBueno);
    html += tablaChecklist('Accesorios', datos.accesorios, mapEstadoBueno);
    html += tablaChecklist('Documentos', datos.documentos, mapEstadoBueno);

    if (datos.danos) {
      const danosMarcados = Object.entries(datos.danos).filter(([, v]) => v?.marcado);
      if (danosMarcados.length > 0) {
        html += `<div class="section-title">Daños Visuales Reportados</div>`;
        for (const [zona, v] of danosMarcados) {
          html += `<div class="dano-row"><strong>${zona.replace(/_/g,' ')}</strong> — ${v.descripcion || 'Sin descripción'}</div>`;
        }
      }
    }
  }

  if (insp.tipo_formulario === 'inspeccion_diaria') {
    html += tablaChecklist('Revisión Exterior', datos.exterior, mapEstadoCorrecto);
    html += tablaChecklist('Revisión Interior', datos.interior, mapEstadoCorrecto);
    html += tablaChecklist('Equipos Médicos', datos.equipo_medico, mapEstadoCorrecto);
    html += tablaChecklist('Accesorios', datos.accesorios_diaria, mapEstadoCorrecto);
    html += tablaChecklist('Limpieza y Saneamiento', datos.saneamiento, mapEstadoCorrecto);
    html += tablaChecklist('Documentación', datos.documentacion, mapEstadoCorrecto);
    if (datos.problemasDetectados) {
      html += `<div class="section-title">Problemas Detectados</div><div class="obs-box">${datos.problemasDetectados}</div>`;
    }
    if (datos.accionesTomadas) {
      html += `<div class="section-title">Acciones Tomadas</div><div class="obs-box">${datos.accionesTomadas}</div>`;
    }
  }

  // DEA / Monitor / Multiparametros: checklist genérico si viene en datos.checklist
  if (datos.checklist && Object.keys(datos.checklist).length > 0) {
    html += tablaChecklist('Checklist de Revisión', datos.checklist, mapEstadoBueno);
  }

  // ── Observaciones generales ──
  if (insp.observaciones && insp.observaciones.trim()) {
    html += `<div class="section-title">Observaciones Generales</div><div class="obs-box">${insp.observaciones}</div>`;
  }

  // ── Nota del revisor ──
  if (insp.nota_revision && insp.nota_revision.trim()) {
    html += `<div class="section-title">Nota del Revisor</div><div class="obs-box" style="background:#eff6ff;border-color:#93c5fd;color:#1e3a8a;">${insp.nota_revision}</div>`;
  }

  // ── Resumen resultado ──
  if (totalItems > 0) {
    const clase = tieneObservaciones ? 'observaciones' : 'aprobado';
    const icono = tieneObservaciones ? '⚠️' : '✅';
    const msg   = tieneObservaciones
      ? `Aprobada con observaciones — ${totalFallas} ítem(s) con falla de ${totalItems} revisados`
      : `Aprobada sin observaciones — ${totalItems} ítem(s) revisados, todos conformes`;
    html += `<div class="resultado-box ${clase}">
      <span class="resultado-icon">${icono}</span>
      <div class="resultado-texto"><strong>${msg}</strong>
        Aprobado por ${revisor.full_name || revisor.email} el ${formatFecha(insp.fecha_revision)}
      </div>
    </div>`;
  }

  html += `<div class="footer">Documento generado automáticamente · ${ahora()} · Sistema de Gestión de Equipos Bitácora</div>`;
  html += `</body></html>`;
  return html;
}

function htmlMantenimientoExterno(equipo, revisor) {
  const fecha = formatFecha(equipo.fecha_ultimo_informe_externo);
  const horaGen = ahora();

  let html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Mantenimiento Externo</title>${estilosBase()}</head><body>`;

  html += `<div class="header">
    <p class="header-title">INFORME DE MANTENIMIENTO EXTERNO</p>
    <p class="header-sub">${normalizarEstablecimiento(equipo.centro_principal) || equipo.centro_principal || 'Sistema de Gestión de Equipos'}</p>
    <div class="header-meta">
      <span>Fecha informe: <strong>${fecha}</strong></span>
      <span>Tipo equipo: <strong>${TIPO_EQUIPO_CATEGORIA[equipo.tipo] || equipo.tipo || '-'}</strong></span>
    </div>
  </div>`;

  html += `<div class="resp-grid">
    <div class="resp-card realizador">
      <div class="rc-title">Empresa Responsable</div>
      <div class="rc-name">${equipo.empresa_responsable_informe_externo || '—'}</div>
      <div class="rc-detail">Fecha del informe: <strong>${fecha}</strong></div>
    </div>
    <div class="resp-card aprobador">
      <div class="rc-title">Registrado por</div>
      <div class="rc-name">${revisor.full_name || revisor.email}</div>
      <div class="rc-detail">Email: <strong>${revisor.email}</strong></div>
      <div class="rc-detail">Registro generado: <strong>${horaGen}</strong></div>
    </div>
  </div>`;

  html += `<div class="section-title">Datos del Equipo</div>
  <div class="equipo-card"><div class="equipo-grid">
    <div class="eq-row"><span class="eq-label">N° Inventario</span><span class="eq-val">${equipo.numero_inventario || '-'}</span></div>
    <div class="eq-row"><span class="eq-label">Tipo</span><span class="eq-val">${TIPO_EQUIPO_CATEGORIA[equipo.tipo] || equipo.tipo || '-'}</span></div>
    <div class="eq-row"><span class="eq-label">Marca / Modelo</span><span class="eq-val">${equipo.marca || '-'} ${equipo.modelo || ''}</span></div>
    <div class="eq-row"><span class="eq-label">N° Serie</span><span class="eq-val">${equipo.numero_serie || '-'}</span></div>
    <div class="eq-row"><span class="eq-label">Establecimiento</span><span class="eq-val">${equipo.centro_principal || '-'}</span></div>
    ${equipo.subsede ? `<div class="eq-row"><span class="eq-label">Subsede</span><span class="eq-val">${equipo.subsede}</span></div>` : ''}
  </div></div>`;

  if (equipo.url_ultimo_informe_externo) {
    html += `<div class="section-title">Documento Original Adjunto</div>
    <p style="font-size:12px;"><a href="${equipo.url_ultimo_informe_externo}" style="color:#1d4ed8;">Ver informe de mantenimiento externo original</a></p>`;
  }

  html += `<div class="resultado-box aprobado" style="margin-top:20px;">
    <span class="resultado-icon">✅</span>
    <div class="resultado-texto"><strong>Informe registrado correctamente</strong>
      Registrado por ${revisor.full_name || revisor.email} el ${horaGen}
    </div>
  </div>`;

  html += `<div class="footer">Documento generado automáticamente · ${horaGen} · Sistema de Gestión de Equipos Bitácora</div>`;
  html += `</body></html>`;
  return html;
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tipo, inspeccion_id, equipo_id } = await req.json();

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Carpeta raíz: BITÁCORA
    const rootDriveId = await obtenerRootDriveId(accessToken);
    const raizId = await obtenerOCrearCarpeta('BITÁCORA', rootDriveId, accessToken);

    if (tipo === 'inspeccion') {
      // ── Subir PDF de inspección aprobada ──
      const insp = await base44.asServiceRole.entities.InspeccionPendiente.get(inspeccion_id);
      if (!insp) return Response.json({ error: 'Inspección no encontrada' }, { status: 404 });

      const datos = (() => { try { return insp.datos_json ? JSON.parse(insp.datos_json) : {}; } catch { return {}; } })();
      const equipo = datos.equipo || {};

      const establecimiento = normalizarEstablecimiento(equipo.centro_principal) || 'Sin Establecimiento';
      const categoriaEquipo = TIPO_FORMULARIO_LABEL[insp.tipo_formulario] === 'Turno Chofer'
        ? 'Turno Chofer'
        : TIPO_EQUIPO_CATEGORIA[equipo.tipo] || equipo.tipo || 'Otros';

      // Determinar mes desde fecha de inspección
      const fechaObj = insp.fecha ? new Date(insp.fecha + 'T12:00:00') : new Date();
      const mesLabel = MESES[fechaObj.getMonth()];
      const anio = fechaObj.getFullYear();

      // Estructura: BITÁCORA / [Cesfam X] / [Categoría] / [Mes Año]
      const establecimientoId = await obtenerOCrearCarpeta(establecimiento, raizId, accessToken);
      const categoriaCarpetaId = await obtenerOCrearCarpeta(categoriaEquipo, establecimientoId, accessToken);
      const mesCarpetaId = await obtenerOCrearCarpeta(`${mesLabel} ${anio}`, categoriaCarpetaId, accessToken);

      const tipoLabel = TIPO_FORMULARIO_LABEL[insp.tipo_formulario] || insp.tipo_formulario;
      const nombreArchivo = `${tipoLabel} - ${insp.equipo_label || insp.equipo_id} - ${insp.fecha || 'sin-fecha'}`;

      const revisorInfo = { full_name: insp.revisor_nombre || user.full_name, email: insp.revisor_email || user.email };
      const htmlContent = htmlInspeccion(insp, revisorInfo);
      const archivo = await subirHtmlComoPDF(nombreArchivo, htmlContent, mesCarpetaId, accessToken);

      // Guardar link en la inspección
      if (archivo.id) {
        await base44.asServiceRole.entities.InspeccionPendiente.update(inspeccion_id, {
          nota_revision: (insp.nota_revision ? insp.nota_revision + ' | ' : '') + `Drive: ${archivo.webViewLink || archivo.id}`,
        });
      }

      return Response.json({ ok: true, archivo });

    } else if (tipo === 'mantenimiento_externo') {
      // ── Subir copia del informe de mantenimiento externo ──
      const equipo = await base44.asServiceRole.entities.Equipo.get(equipo_id);
      if (!equipo) return Response.json({ error: 'Equipo no encontrado' }, { status: 404 });

      const establecimiento = normalizarEstablecimiento(equipo.centro_principal) || 'Sin Establecimiento';
      const categoriaEquipo = TIPO_EQUIPO_CATEGORIA[equipo.tipo] || equipo.tipo || 'Otros';

      const fechaObj = equipo.fecha_ultimo_informe_externo
        ? new Date(equipo.fecha_ultimo_informe_externo + 'T12:00:00')
        : new Date();
      const mesLabel = MESES[fechaObj.getMonth()];
      const anio = fechaObj.getFullYear();

      // Estructura: BITÁCORA / [Cesfam X] / [Categoría] / [Mes Año]
      const establecimientoId = await obtenerOCrearCarpeta(establecimiento, raizId, accessToken);
      const categoriaCarpetaId = await obtenerOCrearCarpeta(categoriaEquipo, establecimientoId, accessToken);
      const mesCarpetaId = await obtenerOCrearCarpeta(`${mesLabel} ${anio}`, categoriaCarpetaId, accessToken);

      const nombreArchivo = `Mantenimiento Externo - ${equipo.numero_inventario || equipo.id} - ${equipo.fecha_ultimo_informe_externo || 'sin-fecha'}`;

      const htmlContent = htmlMantenimientoExterno(equipo, user);
      const archivo = await subirHtmlComoPDF(nombreArchivo, htmlContent, mesCarpetaId, accessToken);

      return Response.json({ ok: true, archivo });

    } else {
      return Response.json({ error: 'Tipo inválido' }, { status: 400 });
    }

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});