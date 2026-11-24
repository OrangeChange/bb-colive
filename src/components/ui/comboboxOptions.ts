export type ComboboxOptionGroup = "recent" | "suggestion";

export type ComboboxOption = {
  value: string;
  label: string;
  group: ComboboxOptionGroup;
};

export function mergeComboboxOptions(
  recentSearches: readonly string[],
  suggestions: readonly string[],
): ComboboxOption[] {
  const seen = new Set<string>();
  const result: ComboboxOption[] = [];

  const append = (values: readonly string[], group: ComboboxOptionGroup) => {
    for (const rawValue of values) {
      const value = rawValue.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push({ value, label: value, group });
    }
  };

  append(recentSearches, "recent");
  append(suggestions, "suggestion");
  return result;
}

export function filterComboboxOptions(options: readonly ComboboxOption[], query: string): ComboboxOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...options];
  return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
}
