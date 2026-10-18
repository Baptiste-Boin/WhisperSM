import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./RecordingOverlay";
import { platform } from "@tauri-apps/plugin-os";
import "@/i18n";

// Keycaps use macOS symbols on macOS (see `keyLabel`).
document.documentElement.dataset.platform = platform();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
