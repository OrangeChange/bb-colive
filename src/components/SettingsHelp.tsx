import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./shadcn/popover";
import { Button } from "./shadcn/button";
export function SettingsHelp({label,children}:{label:string;children:ReactNode}) {
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label}><CircleHelp size={16} aria-hidden/></Button></PopoverTrigger><PopoverContent className="max-w-[calc(100vw-24px)] text-xs text-muted-foreground" aria-label={label}>{children}</PopoverContent></Popover>;
}
