import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(<RouterProvider router={router} />);
