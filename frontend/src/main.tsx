import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/orb.css";
import "./styles/sidebar.css";
import "./styles/conversation.css";
import "./styles/inspector.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
