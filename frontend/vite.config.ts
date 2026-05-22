import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API_URL is set by docker-compose to http://api:8000.
// Falls back to localhost for running outside Docker.
const apiUrl = process.env.API_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/experiments": {
        target: apiUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
