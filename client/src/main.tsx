import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import { App } from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (rootEl === null) throw new Error("index.html is missing the #root mount point");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
