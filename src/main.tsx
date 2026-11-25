import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FundoVivo } from "@/efeitos";
import Plataforma from "@/Plataforma";
import "@/styles.css";

// Bloqueia a página dentro de iframes de outros sites (proteção contra clickjacking).
// O GitHub Pages não permite enviar o cabeçalho frame-ancestors, então a checagem é feita aqui.
const emIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
if (emIframe) {
  try {
    window.top!.location.href = window.location.href;
  } catch {
    /* navegador impediu o redirecionamento: a página simplesmente não é exibida */
  }
  throw new Error("Farol de Vagas não pode ser aberto dentro de outro site.");
}

const el = document.getElementById("root");
if (!el) throw new Error('Elemento <div id="root"> não encontrado no index.html.');

createRoot(el).render(
  <StrictMode>
    <FundoVivo />
    <Plataforma />
  </StrictMode>,
);
