import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Backend ayrı process; tarayıcı için tek origin
      "/api": {
        target: "http://127.0.0.1:8000",
        // Model eğitimi uzun sürebilir
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
});
