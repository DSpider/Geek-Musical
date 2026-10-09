import { createRoot } from "react-dom/client";
import { AdminApp } from "./App.js";
import "../styles.css";
import "../theme.css";
import "./admin.css";
createRoot(document.getElementById("admin-root")!).render(<AdminApp />);
