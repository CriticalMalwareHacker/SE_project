import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  const norm = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Label className="flex items-center gap-2">
      <span>{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger aria-label={label} className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {norm.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Label>
  );
}
