import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: "0.0.0.0",
    // Dev server only. Accepts any Host header so the app can be opened from
    // a proxied preview/tunnel origin. Production output is a static file and
    // is unaffected by this setting.
    allowedHosts: true,
    // The browser talks to /api with relative URLs; the dev server forwards
    // them to the local Node/SQLite runtime. Browser code never names a host.
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:4100",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
