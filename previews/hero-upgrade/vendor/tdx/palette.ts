export type ScenePalette = {
  accent: string;
  accentStrong: string;
  amber: string;
  cool: string;
  wire: string;
  /** Neutral particle colour: ink on the light theme, bone on the dark theme. */
  point: string;
  pointOpacity: number;
  /** Additive blending lets dense regions glow on dark backgrounds. */
  additive: boolean;
};

export const palettes: Record<"light" | "dark", ScenePalette> = {
  light: {
    accent: "#ff5a1f",
    accentStrong: "#e24a12",
    amber: "#ffb020",
    cool: "#0ea5b7",
    wire: "#e24a12",
    point: "#1a1d27",
    pointOpacity: 0.58,
    additive: false,
  },
  dark: {
    accent: "#ff6b2c",
    accentStrong: "#ff8a50",
    amber: "#ffc247",
    cool: "#38d3e8",
    wire: "#ff8a50",
    point: "#f3ede4",
    pointOpacity: 0.42,
    additive: true,
  },
};
