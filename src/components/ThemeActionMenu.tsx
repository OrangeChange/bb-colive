import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "./shadcn/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./shadcn/dropdown-menu";
export function ThemeActionMenu({
  label,
  children,
  items,
  className = "",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  items: readonly {
    label: string;
    action: () => void;
    separator?: boolean;
    icon?: ReactNode;
    current?: boolean;
    disabled?: boolean;
    title?: string;
  }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={className}
          title={label}
          aria-label={label}
        >
          {children}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        data-ui-overlay="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item, index) => (
          <div key={item.label}>
            {item.separator && index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              title={item.title ?? item.label}
              disabled={item.disabled}
              onSelect={item.action}
              aria-current={item.current ? "true" : undefined}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.current && <Check size={14} aria-hidden />}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
