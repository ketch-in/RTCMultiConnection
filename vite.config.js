import { defineConfig } from "vite";

const path = require("path");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
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
