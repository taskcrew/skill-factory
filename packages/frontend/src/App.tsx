import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

function App() {
  return (
    <div>
      <h1>Skill Factory</h1>
      <p>Welcome to Skill Factory.</p>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
