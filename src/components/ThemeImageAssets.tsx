import { createContext, useContext } from "react";

export interface ThemeImageAsset {
  path: string;
  name: string;
  url: string;
  ready?: boolean;
}
export interface ThemeImageAssets {
  images: ThemeImageAsset[];
  add: () => Promise<string | void>;
}
export const ThemeImageAssetsContext = createContext<ThemeImageAssets | null>(
  null,
);
export function useThemeImageAssets() {
  return useContext(ThemeImageAssetsContext);
}
