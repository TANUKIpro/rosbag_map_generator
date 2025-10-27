import "./styles/main.css";
import { App } from "./ui/App";

document.addEventListener("DOMContentLoaded", () => {
  const mount = document.getElementById("app");
  if (!mount) {
    throw new Error("Mount element #app not found");
  }
  const app = new App();
  mount.appendChild(app.element);
});
