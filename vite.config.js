import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

const backendProxy = {
  "/api": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
  "/3d-tiles": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
  "/tiles": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
  "/user-tiles": {
    target: "http://localhost:3001",
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [cesium()],
  build: {
    target: "es2022",
  },
  server: {
    port: 5190,
    strictPort: true,
    open: true,
    proxy: backendProxy,
  },
  preview: {
    port: 4173,
    open: true,
    proxy: backendProxy,
  },
});
