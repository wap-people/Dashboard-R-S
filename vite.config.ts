import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// O site é publicado em https://wap-people.github.io/Dashboard-R-S/, por isso o
// `base` precisa ser o nome do repositório. Se um dia o painel ganhar domínio
// próprio (ou for movido para o repositório wap-people.github.io), troque por "/".
export default defineConfig({
  base: "/Dashboard-R-S/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
