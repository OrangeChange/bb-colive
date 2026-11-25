import { buttonVariants } from "./shadcn/button";
export const actionButtonClass = buttonVariants({variant:"outline"});
export const filterActionButtonClass = buttonVariants({variant:"secondary"}) + " border-accent/60 hover:border-accent hover:bg-accent/15";
export const dangerActionButtonClass = buttonVariants({variant:"destructive-outline"});
export const compactFilterActionButtonClass = buttonVariants({variant:"secondary",size:"sm"}) + " border-accent/60 hover:border-accent hover:bg-accent/15";
export const compactDangerActionButtonClass = buttonVariants({variant:"destructive-outline",size:"sm"});
export const dangerSolidButtonClass = buttonVariants({variant:"destructive"});
export const accentSolidButtonClass = buttonVariants();
