import { defineConfig } from "vite";

const path = require("path");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/RTCMultiConnection.ts"),
      name: "RTCMultiConnection",
      fileName: "RTCMultiConnection2",
    },
  },
});
