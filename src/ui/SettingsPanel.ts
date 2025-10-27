import { createElement, createFieldset } from "../utils/dom";
import { defaultSlamConfig } from "../core/defaults";

export class SettingsPanel {
  readonly element: HTMLElement;

  constructor() {
    this.element = createFieldset("設定");
    this.element.classList.add("settings-panel");
    this.render();
  }

  private render(): void {
    const cfg = defaultSlamConfig();
    this.element.appendChild(this.createNumberField("map-resolution", "解像度 (m)", cfg.resolution, 0.01, 1, 0.01));
    this.element.appendChild(this.createNumberField("map-width", "幅 (m)", cfg.width * cfg.resolution, 1, 500, 1));
    this.element.appendChild(this.createNumberField("map-height", "高さ (m)", cfg.height * cfg.resolution, 1, 500, 1));
    this.element.appendChild(this.createNumberField("downsample", "スキャン間引き", cfg.downsample, 1, 16, 1));

    const thresholds = createElement("div");
    thresholds.appendChild(this.createNumberField("occupied", "占有閾値", cfg.occupiedThresh, 0.5, 0.95, 0.01));
    thresholds.appendChild(this.createNumberField("free", "自由閾値", cfg.freeThresh, 0.01, 0.49, 0.01));
    this.element.appendChild(thresholds);
  }

  private createNumberField(
    id: string,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number
  ): HTMLElement {
    const wrapper = createElement("div");
    const labelEl = createElement("label", { textContent: label, attr: { for: id } });
    const input = createElement("input", {
      attr: {
        id,
        type: "number",
        value: value.toString(),
        min: min.toString(),
        max: max.toString(),
        step: step.toString()
      }
    }) as HTMLInputElement;
    input.disabled = true;
    wrapper.appendChild(labelEl);
    wrapper.appendChild(input);
    return wrapper;
  }
}
