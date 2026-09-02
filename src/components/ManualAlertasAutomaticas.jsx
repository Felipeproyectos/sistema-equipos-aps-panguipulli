import { FileDown, CheckCircle2 } from "lucide-react";

export default function ManualAlertasAutomaticas() {
  const generarManual = () => {
    const htmlManual = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manual de Configuración - Sistema de Alertas Automáticas DEA</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f8fafc;
      color: #1e293b;
    }
    h1 {
      color: #3b82f6;
      border-bottom: 4px solid #3b82f6;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    h2 {
      color: #2563eb;
      margin-top: 32px;
      padding-left: 12px;
      border-left: 4px solid #3b82f6;
    }
    h3 {
      color: #475569;
      margin-top: 24px;
    }
    .requisito {
      background: #fff;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .paso {
      background: #fff;
      padding: 20px;
      margin: 16px 0;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .paso-numero {
      background: #3b82f6;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      margin-right: 12px;
    }
    code {
      background: #f1f5f9;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      color: #dc2626;
      font-size: 14px;
    }
    .code-block {
      background: #1e293b;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
      font-family: 'Courier New', monospace;
      font-size: 14px;
    }
    .alerta {
      background: #fee2e2;
      border: 2px solid #dc2626;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
    }
    .info {
      background: #dbeafe;
      border: 2px solid #3b82f6;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
    }
    .exito {
      background: #dcfce7;
      border: 2px solid #10b981;
      padding: 16px;
      border-radius: 8px;
      margin: 16px 0;
    }
    ul {
      margin: 12px 0;
      padding-left: 24px;
    }
    li {
      margin: 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      background: white;
    }
    th {
      background: #3b82f6;
      color: white;
      padding: 12px;
      text-align: left;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    tr:hover {
      background: #f8fafc;
    }
  </style>
</head>
<body>

<h1>📋 Manual de Configuración</h1>
<h2>Sistema de Alertas Automáticas DEA</h2>
<p><strong>Versión:</strong> 1.0 | <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>

<div class="requisito">
  <h3>⚠️ REQUISITOS PREVIOS</h3>
  <ul>
    <li><strong>Plan Builder+</strong> activo en Base44</li>
    <li>Acceso administrativo a la aplicación</li>
    <li>Al menos un usuario con rol de administrador configurado</li>
  </ul>
</div>

<h2>📖 Descripción General</h2>
<p>
  El sistema de alertas automáticas monitorea continuamente el estado de los parches de los equipos DEA 
  y envía notificaciones por correo electrónico a los administradores cada 3 horas cuando detecta:
</p>
<ul>
  <li><strong>Parches VENCIDOS:</strong> Parches con fecha de vencimiento pasada</li>
  <li><strong>Parches CRÍTICOS:</strong> Parches que vencen en 7 días o menos</li>
  <li><strong>Parches PRÓXIMOS:</strong> Parches que vencen entre 8 y 30 días</li>
</ul>

<h2>🚀 Pasos de Configuración</h2>

<div class="paso">
  <h3><span class="paso-numero">1</span>Actualizar a Plan Builder+</h3>
  <p>El sistema de alertas automáticas requiere funciones backend programadas (Scheduled Tasks), disponibles únicamente en el plan Builder+.</p>
  <ol>
    <li>Accede a tu cuenta de Base44</li>
    <li>Ve a <strong>Configuración → Suscripción</strong></li>
    <li>Actualiza a <strong>Builder+</strong></li>
  </ol>
</div>

<div class="paso">
  <h3><span class="paso-numero">2</span>Habilitar Backend Functions</h3>
  <ol>
    <li>Abre tu aplicación en Base44</li>
    <li>Ve al <strong>Dashboard</strong> de la aplicación</li>
    <li>Navega a <strong>Backend Functions</strong></li>
    <li>Haz clic en <strong>"Enable Backend Functions"</strong></li>
    <li>Confirma la activación</li>
  </ol>
</div>

<div class="paso">
  <h3><span class="paso-numero">3</span>Verificar la Función Backend</h3>
  <p>La función <code>enviar_alertas_automaticas.js</code> ya está creada en tu aplicación. Verifica que esté presente:</p>
  <ol>
    <li>En el editor, revisa la carpeta <code>functions/</code></li>
    <li>Confirma que existe el archivo <code>enviar_alertas_automaticas.js</code></li>
    <li>No modifiques el código a menos que sea necesario</li>
  </ol>
</div>

<div class="paso">
  <h3><span class="paso-numero">4</span>Configurar Scheduled Task</h3>
  <p>Configura la ejecución automática cada 3 horas:</p>
  <ol>
    <li>Ve a <strong>Dashboard → Backend Functions → Scheduled Tasks</strong></li>
    <li>Haz clic en <strong>"Create New Scheduled Task"</strong></li>
    <li>Completa los campos:
      <ul>
        <li><strong>Name:</strong> Alertas DEA Automáticas</li>
        <li><strong>Function:</strong> enviar_alertas_automaticas</li>
        <li><strong>Schedule (cron):</strong> <code>0 */3 * * *</code></li>
        <li><strong>Timezone:</strong> America/Santiago (o tu zona horaria)</li>
      </ul>
    </li>
    <li>Haz clic en <strong>"Save"</strong></li>
    <li>Activa el toggle para <strong>"Enable"</strong></li>
  </ol>
  
  <div class="info">
    <strong>ℹ️ Sobre el Cron Expression:</strong><br>
    <code>0 */3 * * *</code> significa: "Ejecutar en el minuto 0 de cada 3 horas".<br>
    Ejemplos de horarios: 00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
  </div>
</div>

<div class="paso">
  <h3><span class="paso-numero">5</span>Probar el Sistema</h3>
  <p>Realiza una prueba manual antes de esperar 3 horas:</p>
  <ol>
    <li>En <strong>Scheduled Tasks</strong>, localiza tu tarea</li>
    <li>Haz clic en <strong>"Run Now"</strong> para ejecutar manualmente</li>
    <li>Verifica los <strong>logs</strong> para confirmar que se ejecutó correctamente</li>
    <li>Revisa tu correo electrónico (administradores) para confirmar recepción</li>
  </ol>
</div>

<h2>📧 Formato de las Alertas por Correo</h2>
<p>Los administradores recibirán correos con:</p>
<ul>
  <li><strong>Asunto:</strong> "⚠️ Alertas DEA: X parche(s) requieren atención"</li>
  <li><strong>Contenido:</strong> Lista detallada de cada parche crítico con:
    <ul>
      <li>Marca y modelo del equipo</li>
      <li>Establecimiento y ubicación</li>
      <li>Tipo de parche</li>
      <li>Fecha de vencimiento</li>
      <li>Estado (VENCIDO / CRÍTICO / PRÓXIMO)</li>
      <li>Días restantes o días vencidos</li>
    </ul>
  </li>
</ul>

<h2>⏱️ Frecuencia de Envío</h2>
<table>
  <thead>
    <tr>
      <th>Escenario</th>
      <th>Comportamiento</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Hay alertas críticas</td>
      <td>Se envía correo cada 3 horas</td>
    </tr>
    <tr>
      <td>No hay alertas críticas</td>
      <td>No se envía correo (silencio automático)</td>
    </tr>
    <tr>
      <td>Se actualiza un parche</td>
      <td>Se excluye de la próxima alerta si ya no es crítico</td>
    </tr>
  </tbody>
</table>

<h2>🔧 Personalización Avanzada</h2>

<h3>Cambiar la Frecuencia de Envío</h3>
<p>Puedes modificar el cron expression para diferentes frecuencias:</p>
<table>
  <thead>
    <tr>
      <th>Frecuencia</th>
      <th>Cron Expression</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Cada 1 hora</td>
      <td><code>0 * * * *</code></td>
    </tr>
    <tr>
      <td>Cada 3 horas (actual)</td>
      <td><code>0 */3 * * *</code></td>
    </tr>
    <tr>
      <td>Cada 6 horas</td>
      <td><code>0 */6 * * *</code></td>
    </tr>
    <tr>
      <td>Cada 12 horas</td>
      <td><code>0 */12 * * *</code></td>
    </tr>
    <tr>
      <td>Una vez al día (9:00 AM)</td>
      <td><code>0 9 * * *</code></td>
    </tr>
  </tbody>
</table>

<h3>Modificar Umbrales de Alerta</h3>
<p>En el archivo <code>functions/enviar_alertas_automaticas.js</code>, puedes cambiar:</p>
<div class="code-block">
// Línea ~35: Cambiar el umbral de 30 días
if (diffDias <= 30) {  // Cambia 30 por el número de días deseado
  // ...
}

// Línea ~41: Cambiar categorías de estado
estado: diffDias < 0 ? 'VENCIDO' 
      : diffDias <= 7 ? 'CRÍTICO'    // Cambia 7 por otro valor
      : 'PRÓXIMO'
</div>

<h2>🛠️ Solución de Problemas</h2>

<div class="alerta">
  <h3>❌ No llegan correos</h3>
  <ul>
    <li>Verifica que la Scheduled Task esté <strong>habilitada</strong></li>
    <li>Revisa los <strong>logs</strong> en Backend Functions para ver errores</li>
    <li>Confirma que hay al menos un usuario con <code>role: "admin"</code></li>
    <li>Verifica que existan parches críticos (vencen en menos de 30 días)</li>
    <li>Revisa la carpeta de spam/correo no deseado</li>
  </ul>
</div>

<div class="alerta">
  <h3>❌ La función falla al ejecutarse</h3>
  <ul>
    <li>Verifica que Backend Functions esté habilitado</li>
    <li>Revisa que el plan Builder+ esté activo</li>
    <li>Comprueba los logs para mensajes de error específicos</li>
    <li>Asegúrate que las entidades <code>Parche</code>, <code>EquipoDEA</code> y <code>User</code> existan</li>
  </ul>
</div>

<h2>📊 Monitoreo del Sistema</h2>
<p>Para verificar que el sistema funciona correctamente:</p>
<ol>
  <li>Ve a <strong>Backend Functions → Scheduled Tasks</strong></li>
  <li>Revisa el <strong>Last Run</strong> para ver cuándo se ejecutó por última vez</li>
  <li>Haz clic en <strong>View Logs</strong> para ver detalles de ejecución</li>
  <li>Verifica el contador de <strong>Success / Failed</strong> runs</li>
</ol>

<h2>📞 Soporte</h2>
<p>Si necesitas ayuda adicional:</p>
<ul>
  <li>Consulta la documentación de Base44 en <a href="https://docs.base44.com">docs.base44.com</a></li>
  <li>Contacta al soporte técnico de Base44</li>
  <li>Revisa los logs de ejecución para diagnóstico detallado</li>
</ul>

<div class="exito">
  <h3>✅ Sistema Configurado Correctamente</h3>
  <p>
    Una vez completados todos los pasos, el sistema enviará automáticamente alertas cada 3 horas 
    cuando detecte parches críticos. Las alertas se detendrán automáticamente cuando no haya 
    parches que requieran atención.
  </p>
</div>

<hr style="margin: 40px 0; border: none; border-top: 2px solid #e2e8f0;">
<p style="text-align: center; color: #94a3b8; font-size: 14px;">
  © ${new Date().getFullYear()} Sistema de Gestión DEA | Generado automáticamente
</p>

</body>
</html>
    `;

    // Crear blob y descargar
    const blob = new Blob([htmlManual], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Manual_Alertas_Automaticas_DEA_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
          <FileDown className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-900 mb-2">
            Sistema de Alertas Automáticas
          </h3>
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">
            El sistema envía correos automáticamente cada 3 horas cuando detecta parches vencidos o próximos a vencer. 
            Descarga el manual completo de configuración paso a paso.
          </p>
          
          <div className="bg-white rounded-xl p-4 mb-4 border border-blue-100">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Características principales:</h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Envío automático cada 3 horas a administradores</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Alertas para parches vencidos, críticos (≤7 días) y próximos (≤30 días)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Se detiene automáticamente cuando no hay alertas</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>Correos HTML profesionales con detalles completos</span>
              </li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-amber-800">
              <strong>⚠️ Requisito:</strong> Necesitas actualizar a plan <strong>Builder+</strong> para activar las funciones backend programadas (Scheduled Tasks).
            </p>
          </div>

          <button
            onClick={generarManual}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <FileDown className="w-4 h-4" />
            Descargar Manual Completo (.html)
          </button>
        </div>
      </div>
    </div>
  );
}