/**
 * NativePicker – on mobile shows a bottom Sheet for a native picker feel.
 * On desktop falls back to a standard <select>.
 */
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check } from "lucide-react";

export default function NativePicker({ value, onChange, options, placeholder = "Seleccionar...", className = "", disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <>
      {/* Desktop: standard select */}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`hidden lg:block ${className}`}
      >
        {placeholder && !options.find(o => o.value === "") && (
          <option value="">{placeholder}</option>
        )}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Mobile: button + Sheet */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`lg:hidden text-left ${className}`}
        style={{ userSelect: "none" }}
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="ml-1 text-slate-400">▾</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[70vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">{placeholder}</SheetTitle>
          </SheetHeader>
          <div className="space-y-1 pb-4">
            {options.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => handleSelect(o.value)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-slate-100"
                style={{ userSelect: "none", color: o.value === value ? "#2563EB" : "#1e293b" }}
              >
                {o.label}
                {o.value === value && <Check className="w-4 h-4 text-blue-600" />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}