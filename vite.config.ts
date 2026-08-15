import { defineConfig } from "vite";

export default defineConfig({
  base: "/TOC/",
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/three") || id.includes("node_modules/camera-controls")) {
            return "three-vendor";
          }
          if (id.includes("node_modules/@thatopen/ui") || id.includes("node_modules/@thatopen/ui-obc")) {
            return "thatopen-ui";
          }
          if (id.includes("node_modules/@thatopen")) {
            return "thatopen-core";
          }
        },
      },
    },
  },
});
