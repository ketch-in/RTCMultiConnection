import defineConfig from "./vite.config";

const path = require("path");

console.log("docker-config");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    hmr: false,
    host: true,
    proxy: {
      "/socket.io": {
        target: "ws://localhost:9001",
        ws: true,
      },
    },
  },
});
