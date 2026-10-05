import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { installLegacyViewport } from "./utils/legacyViewport";
import "./styles.css";

installLegacyViewport();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
