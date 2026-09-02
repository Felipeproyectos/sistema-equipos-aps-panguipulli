import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function obtenerOCrearCarpeta(nombre, parentId, token) {
  const query = `name='${nombre.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const { files } = await res.json();
  if (files && files.length > 0) return files[0].id;
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

async function subirHtmlComoDoc(nombre, htmlContent, parentId, token) {
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

function estilosBase() {
  return `<style>
    @page { margin: 24mm 20mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a202c; margin: 0; padding: 0; }
    .header { background: #1d4ed8; color: white; padding: 18px 24px 14px; margin-bottom: 20px; }
    .header-title { font-size: 20px; font-weight: bold; letter-spacing: 0.5px; margin: 0 0 2px 0; }
    .header-sub { font-size: 12px; opacity: 0.85; margin: 0; }
    .header-meta { display: flex; gap: 32px; margin-top: 10px; font-size: 11px; opacity: 0.9; }
    .prueba-badge { background: #fef3c7; border: 2px solid #f59e0b; padding: 8px 14px; margin-bottom: 16px; color: #92400e; font-weight: bold; font-size: 11px; text-align: center; }
    .resp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
    .resp-card { border-radius: 6px; padding: 12px 14px; }
    .resp-card.realizador { background: #eff6ff; border: 1px solid #bfdbfe; }
    .resp-card.aprobador  { background: #f0fdf4; border: 1px solid #86efac; }
    .rc-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; }
    .resp-card.realizador .rc-title { color: #1d4ed8; }
    .resp-card.aprobador  .rc-title { color: #16a34a; }
    .rc-name { font-size: 13px; font-weight: bold; color: #111827; margin-bottom: 2px; }
    .rc-detail { font-size: 11px; color: #6b7280; }
    .equipo-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; }
    .equipo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .eq-row { display: flex; gap: 6px; align-items: baseline; }
    .eq-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; white-space: nowrap; }
    .eq-val { font-size: 12px; color: #1e293b; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 12px 0; }
    .stat-card { border-radius: 6px; padding: 10px; text-align: center; }
    .stat-num { font-size: 22px; font-weight: bold; }
    .stat-lbl { font-size: 10px; margin-top: 2px; }
    .section-title { font-size: 13px; font-weight: bold; color: #1d4ed8; margin: 18px 0 6px 0; border-bottom: 2px solid #bfdbfe; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    thead th { background: #1e40af; color: white; padding: 6px 10px; font-size: 11px; text-align: left; }
    tbody td { padding: 5px 10px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 10px; font-weight: bold; }
    .b-ok    { background: #dcfce7; color: #166534; }
    .b-falla { background: #fee2e2; color: #991b1b; }
    .b-na    { background: #f1f5f9; color: #64748b; }
    .dano-row { background: #fff7ed; border-left: 3px solid #fb923c; padding: 5px 10px; margin-bottom: 4px; font-size: 11px; color: #7c2d12; }
    .obs-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; font-size: 11px; color: #78350f; margin: 8px 0 14px 0; }
    .resultado-box { display: flex; align-items: center; gap: 10px; border-radius: 6px; padding: 12px 16px; margin-top: 20px; }
    .resultado-box.observaciones { background: #fffbeb; border: 1.5px solid #fde68a; }
    .resultado-icon { font-size: 22px; }
    .resultado-texto { font-size: 11px; color: #374151; }
    .resultado-texto strong { font-size: 13px; display: block; color: #111827; margin-bottom: 2px; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; color: #94a3b8; text-align: center; }
  </style>`;
}

function generarHTMLPrueba() {
  const ahora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' });

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Pauta Semanal - PRUEBA</title>${estilosBase()}</head><body>

    <div class="header">
      <p class="header-title">PAUTA SEMANAL DE INSPECCIÓN</p>
      <p class="header-sub">Cesfam Panguipulli · Sistema de Gestión de Equipos Bitácora</p>
      <div class="header-meta">
        <span>Fecha pauta: <strong>26/04/2026</strong></span>
        <span>Tipo equipo: <strong>Ambulancia</strong></span>
        <span>Patente: <strong>BCDF-12</strong></span>
      </div>
    </div>

    <div class="prueba-badge">⚠ DOCUMENTO DE PRUEBA — Datos ficticios para evaluación del formato</div>

    <div class="resp-grid">
      <div class="resp-card realizador">
        <div class="rc-title">Realizado por</div>
        <div class="rc-name">Juan Pérez González</div>
        <div class="rc-detail">Fecha de realización: <strong>26/04/2026</strong></div>
        <div class="rc-detail">KM inicial: <strong>87.540 km</strong></div>
        <div class="rc-detail">Combustible: <strong>3/4 (75%)</strong></div>
      </div>
      <div class="resp-card aprobador">
        <div class="rc-title">Aprobado por</div>
        <div class="rc-name">María González Administradora</div>
        <div class="rc-detail">Email: <strong>mgonzalez@cesfam.cl</strong></div>
        <div class="rc-detail">Fecha de aprobación: <strong>27/04/2026</strong></div>
        <div class="rc-detail">Registro generado: <strong>${ahora}</strong></div>
      </div>
    </div>

    <div class="section-title">Datos del Equipo</div>
    <div class="equipo-card"><div class="equipo-grid">
      <div class="eq-row"><span class="eq-label">Equipo</span><span class="eq-val">Ambulancia Toyota HiAce</span></div>
      <div class="eq-row"><span class="eq-label">Tipo</span><span class="eq-val">Ambulancia</span></div>
      <div class="eq-row"><span class="eq-label">Marca / Modelo</span><span class="eq-val">Toyota HiAce 2022</span></div>
      <div class="eq-row"><span class="eq-label">N° Serie</span><span class="eq-val">TYT-2022-00845</span></div>
      <div class="eq-row"><span class="eq-label">Establecimiento</span><span class="eq-val">Cesfam Panguipulli</span></div>
      <div class="eq-row"><span class="eq-label">Subsede</span><span class="eq-val">Módulo Urgencia</span></div>
      <div class="eq-row"><span class="eq-label">Patente</span><span class="eq-val">BCDF-12</span></div>
      <div class="eq-row"><span class="eq-label">N° Inventario</span><span class="eq-val">AMB-2024-001</span></div>
    </div></div>

    <div class="stats-grid">
      <div class="stat-card" style="background:#dcfce7;color:#166534;">
        <div class="stat-num">15</div><div class="stat-lbl">Ítems OK</div>
      </div>
      <div class="stat-card" style="background:#fee2e2;color:#991b1b;">
        <div class="stat-num">3</div><div class="stat-lbl">Con Fallas</div>
      </div>
      <div class="stat-card" style="background:#f1f5f9;color:#64748b;">
        <div class="stat-num">2</div><div class="stat-lbl">No Aplica</div>
      </div>
    </div>

    <div class="section-title">Luces</div>
    <table>
      <thead><tr><th style="width:50%">Ítem</th><th style="width:20%">Estado</th><th>Observación</th></tr></thead>
      <tbody>
        <tr><td>Luces delanteras</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Luces traseras</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Luces de emergencia (baliza)</td><td><span class="badge b-falla">FALLA</span></td><td>Baliza derecha intermitente, requiere revisión</td></tr>
        <tr><td>Luces interiores</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Luces de freno</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
      </tbody>
    </table>

    <div class="section-title">Motor</div>
    <table>
      <thead><tr><th style="width:50%">Ítem</th><th style="width:20%">Estado</th><th>Observación</th></tr></thead>
      <tbody>
        <tr><td>Nivel de aceite</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Nivel de agua/refrigerante</td><td><span class="badge b-falla">FALLA</span></td><td>Nivel bajo, se añadió refrigerante de emergencia</td></tr>
        <tr><td>Nivel de líquido de frenos</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Correas y mangueras</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Batería del vehículo</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
      </tbody>
    </table>

    <div class="section-title">Accesorios</div>
    <table>
      <thead><tr><th style="width:50%">Ítem</th><th style="width:20%">Estado</th><th>Observación</th></tr></thead>
      <tbody>
        <tr><td>Sirena / altavoz</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Extintor</td><td><span class="badge b-ok">OK</span></td><td>Vence en 8 meses</td></tr>
        <tr><td>Camilla</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Botiquín de emergencia</td><td><span class="badge b-falla">FALLA</span></td><td>Faltan 2 ampollas de adrenalina — solicitud enviada</td></tr>
        <tr><td>Kit de oxígeno</td><td><span class="badge b-ok">OK</span></td><td>Cilindro al 80%</td></tr>
      </tbody>
    </table>

    <div class="section-title">Documentos</div>
    <table>
      <thead><tr><th style="width:50%">Ítem</th><th style="width:20%">Estado</th><th>Observación</th></tr></thead>
      <tbody>
        <tr><td>Permiso de circulación</td><td><span class="badge b-ok">OK</span></td><td>Vigente hasta Nov 2026</td></tr>
        <tr><td>Revisión técnica</td><td><span class="badge b-ok">OK</span></td><td>Vigente hasta Ago 2026</td></tr>
        <tr><td>SOAP / Seguro obligatorio</td><td><span class="badge b-ok">OK</span></td><td>—</td></tr>
        <tr><td>Hoja de ruta</td><td><span class="badge b-na">N/A</span></td><td>—</td></tr>
      </tbody>
    </table>

    <div class="section-title">Daños Visuales Reportados</div>
    <div class="dano-row"><strong>Lateral derecho</strong> — Rayón superficial a la altura del panel trasero, sin daño estructural</div>

    <div class="section-title">Observaciones Generales</div>
    <div class="obs-box">El vehículo se encuentra en condiciones generales aceptables. Se reportaron 3 ítems con observación: baliza derecha intermitente (se revisará con mantención programada), nivel de refrigerante bajo (corregido en terreno), y faltante de ampollas en botiquín (solicitud de reposición enviada al administrador).</div>

    <div class="section-title">Nota del Revisor</div>
    <div class="obs-box" style="background:#eff6ff;border-color:#93c5fd;color:#1e3a8a;">Inspección aprobada. Se deja constancia de los ítems pendientes para seguimiento en próxima semana.</div>

    <div class="resultado-box observaciones">
      <span class="resultado-icon">⚠️</span>
      <div class="resultado-texto">
        <strong>Aprobada con observaciones — 3 ítem(s) con falla de 19 revisados</strong>
        Aprobado por María González Administradora el 27/04/2026
      </div>
    </div>

    <div class="footer">Documento generado automáticamente · ${ahora} · Sistema de Gestión de Equipos Bitácora<br>
    Este es un documento de PRUEBA con datos ficticios para evaluación del formato.</div>

  </body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const rootDriveId = await obtenerRootDriveId(accessToken);
    const raizId = await obtenerOCrearCarpeta('BITÁCORA', rootDriveId, accessToken);
    const establecimientoId = await obtenerOCrearCarpeta('Cesfam Panguipulli', raizId, accessToken);
    const categoriaId = await obtenerOCrearCarpeta('Ambulancias', establecimientoId, accessToken);
    const pruebasCarpetaId = await obtenerOCrearCarpeta('Abril 2026', categoriaId, accessToken);

    const htmlContent = generarHTMLPrueba();
    const hoy = new Date().toLocaleDateString('es-CL').replace(/\//g, '-');
    const archivo = await subirHtmlComoDoc(`[PRUEBA] Pauta Semanal - Ambulancia Ejemplo - ${hoy}`, htmlContent, pruebasCarpetaId, accessToken);

    return Response.json({
      ok: true,
      mensaje: 'Documento de prueba creado en Google Drive',
      link: archivo.webViewLink,
      nombre: archivo.name,
      carpeta: 'Sistema Gestión Equipos / _Documentos de Prueba',
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});