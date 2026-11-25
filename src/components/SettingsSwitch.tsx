import { Switch } from "./shadcn/switch";
export function SwitchButton({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      aria-label={label}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
    />
  );
}
