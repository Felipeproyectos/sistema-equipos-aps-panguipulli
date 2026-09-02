import { useState, useRef } from "react";
import ExcelJS from "exceljs";
import { base44 } from "@/api/base44Client";
import { X, UploadCloud, Loader2, CheckCircle2, AlertCircle, Download, FileSpreadsheet } from "lucide-react";

const COLUMNAS = [
  "nombre", "codigo", "categoria", "marca_modelo_compat",
  "stock_actual", "stock_minimo", "precio_unitario",
  "proveedor_nombre", "ubicacion_bodega",
  "numero_factura", "fecha_factura",
  "numero_orden_compra", "fecha_orden_compra", "notas",
];

const CATEGORIAS_VALIDAS = ["neumaticos", "frenos", "bateria", "filtros", "lubricantes", "electrico", "sirena", "luces", "otros"];

export default function CargaMasivaRepuestos({ open, onClose, onComplete, proveedores }) {
  const [step, setStep] = useState("upload"); // upload | preview | importing | done
  const [archivo, setArchivo] = useState(null);
  const [fileUrl, setFileUrl] = useState("");
  const [registros, setRegistros] = useState([]);
  const [errores, setErrores] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const inputRef = useRef(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload"); setArchivo(null); setFileUrl("");
    setRegistros([]); setErrores([]); setResultado(null); setProcesando(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const descargarPlantilla = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sistema de Gestión de Equipos";
    wb.created = new Date();

    // Hoja principal: Repuestos
    const ws = wb.addWorksheet("Repuestos", { views: [{ state: "frozen", ySplit: 3 }] });

    const headers = [
      { key: "nombre", label: "nombre *", required: true },
      { key: "codigo", label: "codigo" },
      { key: "categoria", label: "categoria *", required: true },
      { key: "marca_modelo_compat", label: "marca_modelo_compat" },
      { key: "stock_actual", label: "stock_actual" },
      { key: "stock_minimo", label: "stock_minimo" },
      { key: "precio_unitario", label: "precio_unitario" },
      { key: "proveedor_nombre", label: "proveedor_nombre" },
      { key: "ubicacion_bodega", label: "ubicacion_bodega" },
      { key: "numero_factura", label: "numero_factura (opcional)" },
      { key: "fecha_factura", label: "fecha_factura (opcional)" },
      { key: "numero_orden_compra", label: "numero_orden_compra (opcional)" },
      { key: "fecha_orden_compra", label: "fecha_orden_compra (opcional)" },
      { key: "notas", label: "notas" },
    ];
    const colCount = headers.length;
    const thin = { style: "thin", color: { argb: "FFE2E8F0" } };

    // Fila 1: Título
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = "Plantilla Carga Masiva de Repuestos";
    titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    ws.getRow(1).height = 28;

    // Fila 2: Nota
    ws.mergeCells(2, 1, 2, colCount);
    const noteCell = ws.getCell(2, 1);
    noteCell.value = "Los campos marcados con * son obligatorios. El resto es opcional, incluida la factura y la orden de compra.";
    noteCell.font = { italic: true, size: 10, color: { argb: "FF475569" } };
    noteCell.alignment = { vertical: "middle", horizontal: "left" };
    noteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    ws.getRow(2).height = 20;

    // Fila 3: Encabezados
    const headerRow = ws.getRow(3);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h.label;
      cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: h.required ? "FF2563EB" : "FF64748B" } };
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
    });
    ws.getRow(3).height = 26;

    // Fila 4: Ejemplo
    const ejemplo = [
      "Filtro de aceite", "F-001", "filtros", "Toyota Hilux 2018", 10, 3, 12000,
      "Repuestos Chile", "Estante A-1", "F-2024-001", "2026-01-15", "OC-456", "2026-01-10", "Repuesto de prueba",
    ];
    const exRow = ws.getRow(4);
    ejemplo.forEach((val, i) => {
      const cell = exRow.getCell(i + 1);
      cell.value = val;
      cell.font = { size: 10, color: { argb: "FF64748B" }, italic: true };
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFBFC" } };
    });
    ws.getRow(4).height = 18;

    // Filas vacías con bordes para que el usuario complete
    for (let r = 5; r <= 20; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      }
      row.height = 18;
    }

    // Anchos de columna
    ws.columns = headers.map(h => ({ width: Math.max(h.label.length + 2, 16) }));

    // Hoja 2: Instrucciones
    const ws2 = wb.addWorksheet("Instrucciones");
    ws2.getColumn(1).width = 8;
    ws2.getColumn(2).width = 70;
    ws2.mergeCells("A1:B1");
    const t2 = ws2.getCell("A1");
    t2.value = "Instrucciones de uso";
    t2.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t2.alignment = { horizontal: "center", vertical: "middle" };
    t2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    ws2.getRow(1).height = 26;

    const instrucciones = [
      ["1.", "Complete la hoja 'Repuestos' con un repuesto por fila."],
      ["2.", "Los campos 'nombre' y 'categoria' son obligatorios; el resto es opcional."],
      ["3.", "Categorías válidas: neumaticos, frenos, bateria, filtros, lubricantes, electrico, sirena, luces, otros."],
      ["4.", "Si 'categoria' no es válida, se asignará 'otros' automáticamente."],
      ["5.", "Si 'proveedor_nombre' coincide con uno existente, se asociará automáticamente."],
      ["6.", "Fechas en formato AAAA-MM-DD (ej: 2026-01-15)."],
      ["7.", "Factura y orden de compra son opcionales: número, fecha y documento no son obligatorios."],
      ["8.", "Sube el archivo completado (.xlsx o .csv) desde el botón de carga."],
    ];
    instrucciones.forEach((row, idx) => {
      const r = ws2.getRow(idx + 2);
      r.getCell(1).value = row[0];
      r.getCell(2).value = row[1];
      r.getCell(1).font = { bold: true, size: 10 };
      r.getCell(1).alignment = { vertical: "top", horizontal: "center" };
      r.getCell(2).font = { size: 10 };
      r.getCell(2).alignment = { vertical: "middle", wrapText: true };
      r.height = 22;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_repuestos.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setProcesando(true);
    setErrores([]);
    try {
      const upload = await base44.integrations.Core.UploadFile({ file });
      const url = upload.file_url;
      setFileUrl(url);
      const schema = {
        type: "object",
        properties: {
          repuestos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                codigo: { type: "string" },
                categoria: { type: "string" },
                marca_modelo_compat: { type: "string" },
                stock_actual: { type: "number" },
                stock_minimo: { type: "number" },
                precio_unitario: { type: "number" },
                proveedor_nombre: { type: "string" },
                ubicacion_bodega: { type: "string" },
                numero_factura: { type: "string" },
                fecha_factura: { type: "string" },
                numero_orden_compra: { type: "string" },
                fecha_orden_compra: { type: "string" },
                notas: { type: "string" },
              },
            },
          },
        },
      };
      const extract = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url: url, json_schema: schema });
      let lista = [];
      if (Array.isArray(extract.output)) lista = extract.output;
      else if (extract.output?.repuestos) lista = extract.output.repuestos;
      else if (Array.isArray(extract.output)) lista = extract.output;

      // Validar y normalizar
      const validados = [];
      const errs = [];
      lista.forEach((r, idx) => {
        if (!r.nombre || !String(r.nombre).trim()) { errs.push(`Fila ${idx + 2}: falta "nombre"`); return; }
        let cat = String(r.categoria || "otros").toLowerCase().trim();
        if (!CATEGORIAS_VALIDAS.includes(cat)) cat = "otros";
        const provNombre = String(r.proveedor_nombre || "").trim();
        const provMatch = proveedores.find(p => p.nombre.toLowerCase() === provNombre.toLowerCase());
        validados.push({
          nombre: String(r.nombre).trim(),
          codigo: String(r.codigo || "").trim(),
          categoria: cat,
          marca_modelo_compat: String(r.marca_modelo_compat || "").trim(),
          stock_actual: Number(r.stock_actual) || 0,
          stock_minimo: Number(r.stock_minimo) || 0,
          precio_unitario: Number(r.precio_unitario) || 0,
          proveedor_id: provMatch?.id || "",
          proveedor_nombre: provNombre,
          ubicacion_bodega: String(r.ubicacion_bodega || "").trim(),
          numero_factura: String(r.numero_factura || "").trim(),
          fecha_factura: r.fecha_factura || "",
          numero_orden_compra: String(r.numero_orden_compra || "").trim(),
          fecha_orden_compra: r.fecha_orden_compra || "",
          notas: String(r.notas || "").trim(),
        });
      });
      setRegistros(validados);
      setErrores(errs);
      setStep(validados.length > 0 ? "preview" : "upload");
    } catch (err) {
      setErrores(["Error al procesar el archivo: " + (err.message || "desconocido")]);
    }
    setProcesando(false);
  };

  const importar = async () => {
    setStep("importing");
    setProcesando(true);
    try {
      const res = await base44.entities.Repuesto.bulkCreate(registros);
      setResultado({ success: registros.length, failed: 0 });
      setStep("done");
    } catch (err) {
      setResultado({ success: 0, failed: registros.length, error: err.message });
      setStep("done");
    }
    setProcesando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" style={{ background: "rgba(15,23,42,0.5)" }}>
      <div className="bg-white w-full lg:max-w-2xl rounded-t-3xl lg:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Carga Masiva de Repuestos
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Step: upload */}
          {step === "upload" && (
            <>
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <p className="text-sm font-bold text-blue-800">Instrucciones</p>
                <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                  <li>Descarga la plantilla, completa los datos y vuelve a subirla.</li>
                  <li>Columnas: {COLUMNAS.join(", ")}.</li>
                  <li>Categorías válidas: {CATEGORIAS_VALIDAS.join(", ")}.</li>
                  <li>El campo "nombre" es obligatorio; el resto opcional.</li>
                  <li>Si "proveedor_nombre" coincide con uno existente, se asociará automáticamente.</li>
                </ul>
                <button onClick={descargarPlantilla}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#2563EB" }}>
                  <Download className="w-4 h-4" /> Descargar plantilla Excel
                </button>
              </div>

              <div
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 transition-all">
                {procesando ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-500">Procesando archivo...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <UploadCloud className="w-10 h-10 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">Haz clic para seleccionar archivo</p>
                    <p className="text-xs text-slate-400">Formatos: .xlsx, .xls, .csv</p>
                    {archivo && <p className="text-xs font-bold text-blue-600 mt-1">{archivo.name}</p>}
                  </div>
                )}
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleArchivo} />
              </div>

              {errores.length > 0 && (
                <div className="rounded-xl p-3 space-y-1" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                  {errores.map((er, i) => (
                    <p key={i} className="text-xs text-red-600 flex items-start gap-1.5"><AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{er}</p>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step: preview */}
          {step === "preview" && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                {registros.length} repuesto{registros.length !== 1 ? "s" : ""} detectado{registros.length !== 1 ? "s" : ""}
              </div>
              {errores.length > 0 && (
                <div className="rounded-xl p-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <p className="text-xs font-bold text-amber-700 mb-1">{errores.length} fila(s) omitida(s):</p>
                  {errores.map((er, i) => <p key={i} className="text-xs text-amber-600">{er}</p>)}
                </div>
              )}
              <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #E2E8F0" }}>
                <table className="w-full text-xs">
                  <thead style={{ background: "#F8FAFC" }}>
                    <tr className="text-slate-500">
                      <th className="text-left px-3 py-2 font-semibold">Nombre</th>
                      <th className="text-left px-3 py-2 font-semibold">Categoría</th>
                      <th className="text-right px-3 py-2 font-semibold">Stock</th>
                      <th className="text-right px-3 py-2 font-semibold">Precio</th>
                      <th className="text-left px-3 py-2 font-semibold">Proveedor</th>
                      <th className="text-left px-3 py-2 font-semibold">N° Factura</th>
                      <th className="text-left px-3 py-2 font-semibold">N° OC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {registros.slice(0, 50).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-semibold text-slate-700">{r.nombre}</td>
                        <td className="px-3 py-2">{r.categoria}</td>
                        <td className="px-3 py-2 text-right">{r.stock_actual}</td>
                        <td className="px-3 py-2 text-right">${(r.precio_unitario || 0).toLocaleString("es-CL")}</td>
                        <td className="px-3 py-2 text-slate-500">{r.proveedor_nombre || "-"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.numero_factura || "-"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.numero_orden_compra || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {registros.length > 50 && (
                  <p className="text-xs text-slate-400 text-center py-2">... y {registros.length - 50} más</p>
                )}
              </div>
            </>
          )}

          {/* Step: importing */}
          {step === "importing" && (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-600 font-semibold">Importando {registros.length} repuestos...</p>
            </div>
          )}

          {/* Step: done */}
          {step === "done" && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              {resultado?.failed === 0 ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="font-bold text-slate-800">¡Importación completada!</p>
                  <p className="text-sm text-slate-500">{resultado.success} repuesto(s) creado(s) correctamente.</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="font-bold text-slate-800">Error en la importación</p>
                  <p className="text-sm text-red-500">{resultado?.error || "No se pudieron crear los registros."}</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-2">
          {step === "preview" && (
            <>
              <button onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-100 text-slate-600">Volver a subir</button>
              <button onClick={importar} className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2" style={{ background: "#16A34A" }}>
                <UploadCloud className="w-4 h-4" /> Importar {registros.length}
              </button>
            </>
          )}
          {step === "done" && (
            <button onClick={() => { onComplete(); handleClose(); }} className="flex-1 py-3 rounded-xl text-sm font-bold text-white" style={{ background: "#2563EB" }}>Finalizar</button>
          )}
          {(step === "upload" || step === "importing") && (
            <button onClick={handleClose} className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-100 text-slate-600">Cerrar</button>
          )}
        </div>
      </div>
    </div>
  );
}