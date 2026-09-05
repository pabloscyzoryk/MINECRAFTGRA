import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import "../app/multiplayer.css";
import "../app/media.css";
createRoot(document.getElementById("root")!).render(<Home />);
