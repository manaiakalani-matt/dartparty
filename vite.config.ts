import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: ["safari12", "ios12"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
