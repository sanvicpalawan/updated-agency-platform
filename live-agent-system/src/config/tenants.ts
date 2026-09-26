// Initial mock workspaces only. Subsequent changes are managed through the admin UI.
export const TENANT_PRESETS = [
  ["BAIA", "baia", "Hospitality", "B", "#dab77a", "active"],
  ["Azarraga Glass", "azarraga-glass", "Architecture & glass", "A", "#9bc7e5", "active"],
  ["Marina Terrace", "marina-terrace", "Food & beverage", "M", "#bcb3e9", "active"],
  ["Aurelia Suites", "aurelia-suites", "Boutique hotel", "a", "#b7c7ad", "active"],
  ["Studio North", "studio-north", "Design studio", "N", "#e9b69d", "paused"],
  ["The Atrium", "the-atrium", "Events & venues", "A", "#d4c895", "setup"],
] as const;