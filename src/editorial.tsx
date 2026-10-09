import { createRoot } from "react-dom/client";
import { ThemeControl } from "./components/ThemeControl";
import "./styles.css";
import "./institutional.css";
import "./theme.css";
import "./blog.css";
import "./analytics/index.js";
const island = document.querySelector("[data-theme-island]");
if (island) createRoot(island).render(<ThemeControl />);

import "./musical.css";
