import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
// Reihenfolge: Basis-Design-System zuerst, Landing-Styles dürfen überschreiben
import "./styles.css";
import "./landing.css";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL || "https://quick-ox-60.eu-west-1.convex.cloud"
);

// Set theme from localStorage before render
const savedTheme = localStorage.getItem("faktox_theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
