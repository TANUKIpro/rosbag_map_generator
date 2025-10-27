import { createElement } from "../utils/dom";

export class StatsPanel {
  readonly element: HTMLElement;
  private readonly fpsEl: HTMLSpanElement;
  private readonly wasmEl: HTMLSpanElement;
  private readonly memEl: HTMLSpanElement;

  constructor() {
    this.fpsEl = createElement("span", { textContent: "FPS: --" });
    this.wasmEl = createElement("span", { textContent: "WASM: -- ms" });
    this.memEl = createElement("span", { textContent: "メモリ: -- MB" });

    this.element = createElement("div", { className: "stats-bar" });
    this.element.append(this.fpsEl, this.wasmEl, this.memEl);
  }

  update(stats: { fps: number; wasm: number; mem: number }): void {
    this.fpsEl.textContent = `FPS: ${stats.fps.toFixed(1)}`;
    this.wasmEl.textContent = `WASM: ${stats.wasm.toFixed(1)} ms`;
    this.memEl.textContent = `メモリ: ${stats.mem.toFixed(1)} MB`;
  }
}
