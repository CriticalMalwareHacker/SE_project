import * as React from "react";

export function Button({ className = "", variant = "default", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  const base = "rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-400 disabled:opacity-50 border ";
  const v =
    variant === "destructive"
      ? "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
      : variant === "outline"
        ? "bg-transparent text-slate-200 border-slate-700 hover:border-teal-400"
        : variant === "ghost"
          ? "border-transparent text-slate-300 hover:bg-slate-800"
          : "bg-teal-400 text-slate-950 border-teal-400 hover:bg-teal-300";
  return <button className={base + v + " " + className} {...p} />;
}

export function Card({ className = "", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={"rounded-lg border border-slate-800 bg-slate-900 p-5 " + className} {...p} />;
}

export function Badge({ className = "", tone = "neutral", ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-500/15 text-slate-400 border-slate-700",
    success: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
    warning: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    critical: "bg-red-400/15 text-red-400 border-red-400/30",
    info: "bg-teal-400/15 text-teal-400 border-teal-400/30",
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${tones[tone] || tones.neutral} ${className}`} {...p} />;
}

export function Progress({ value = 0 }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800" role="progressbar" aria-valuenow={value}>
      <div className="h-full bg-teal-400 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={"rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-400 focus:outline-none " + (p.className || "")} />;
}

export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={"rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-teal-400 focus:outline-none " + (p.className || "")} />;
}

export function Label({ className = "", ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={"text-xs text-slate-400 " + className} {...p} />;
}

export function Separator() {
  return <hr className="border-slate-800" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={"animate-pulse rounded bg-slate-800 " + className} />;
}

export function ScrollArea({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={"overflow-y-auto " + (className || "")}>{children}</div>;
}

export function Checkbox(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" {...p} className={"h-4 w-4 accent-teal-400 " + (p.className || "")} />;
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`h-5 w-9 rounded-full border border-slate-700 ${checked ? "bg-teal-400" : "bg-slate-800"}`}>
      <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label?: string }) {
  return (
    <label className="text-xs text-slate-400">
      {label}
      <select aria-label={label || "select"} value={value} onChange={(e) => onChange(e.target.value)} className="ml-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-sm text-slate-200">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function Tooltip({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <span title={tip} className="cursor-help underline decoration-dotted decoration-slate-600">
      {children}
    </span>
  );
}

export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <table className={"w-full text-sm " + className}>{children}</table>;
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-800">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={`px-3 py-2 text-sm ${value === t.id ? "border-b-2 border-teal-400 text-teal-400" : "text-slate-400"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div role="dialog" aria-label={title} className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-medium text-slate-50">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function AlertDialog({ open, onClose, onConfirm, title, body }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div role="alertdialog" aria-label={title} className="w-full max-w-md rounded-lg border border-red-500/40 bg-slate-900 p-6">
        <h2 className="text-lg font-medium text-red-400">{title}</h2>
        <p className="mt-2 text-sm text-slate-300">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Confirm halt</Button>
        </div>
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div role="dialog" aria-label={title} className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-50">{title}</h2>
          <Button variant="ghost" aria-label="Close panel" onClick={onClose}>✕</Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function DropdownMenu({ label, items }: { label: string; items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <Button variant="outline" aria-label={label} onClick={() => setOpen(!open)}>{label}</Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-xl">
          {items.map((i) => (
            <button key={i.label} className="block w-full rounded px-2 py-1 text-left text-sm text-slate-200 hover:bg-slate-800" onClick={() => { i.onClick(); setOpen(false); }}>{i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Popover({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative">
      <button aria-label={label} className="text-slate-400 hover:text-teal-400" onClick={() => setOpen(!open)}>ⓘ</button>
      {open && <span className="absolute z-20 w-56 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300 shadow-xl">{children}</span>}
    </span>
  );
}

export function Command({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function toast(msg: string): void {
  const el = document.createElement("div");
  el.textContent = msg;
  el.setAttribute("role", "status");
  el.className = "fixed bottom-4 right-4 z-[100] rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  return <nav aria-label="Primary" className="flex flex-col gap-1">{children}</nav>;
}
