import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    target: "es2022",
  },
  server: {
    port: 5178,
    open: false,
  },
});
