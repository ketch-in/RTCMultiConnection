import { defineConfig } from "vite";
const path = require("path");

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/RTCMultiConnection.ts"),
      name: "RTCMultiConnection",
      fileName: "RTCMultiConnection.js",
    },
    outDir: "./dist-js",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  logLevel: "info",
  server: {
    open: true,
    host: true,

    proxy: {
      "/socket.io": {
        target: "ws://localhost:9001",
        ws: true,
      },
    },
  },
});
