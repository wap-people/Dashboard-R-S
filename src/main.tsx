import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Dashboard from "@/App";
import "@/styles.css";

const el = document.getElementById("root");
if (!el) throw new Error('Elemento <div id="root"> não encontrado no index.html.');

createRoot(el).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
