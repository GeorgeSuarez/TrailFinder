import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxy = { "/api": "http://localhost:3000" } as const;

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
