import React from "react";

export default function KpiCard({ label, value, total, icon: Icon, color, bg, sub }) {
  return (
    <div className="bg-white rounded-2xl p-4 lg:p-5 transition-all"
      style={{ boxShadow: "0 4px 20px rgba(15,45,107,0.08)" }}>
      <div className="flex items-center gap-3 lg:block">
        <div className="w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center flex-shrink-0 lg:mb-3"
          style={{ background: bg }}>
          <Icon className="w-4 h-4 lg:w-5 lg:h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl lg:text-3xl font-bold" style={{ color }}>
            {value}{total !== undefined && <span className="text-slate-300 text-base font-medium">/{total}</span>}
          </p>
          <p className="text-xs text-slate-500 font-medium leading-tight">{label}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}