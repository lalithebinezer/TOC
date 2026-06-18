import { defineConfig } from "vite";

export default defineConfig({
  base: "/TOC/",
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1000,
  },
});
