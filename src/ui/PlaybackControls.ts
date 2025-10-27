import { createElement } from "../utils/dom";

export class PlaybackControls {
  readonly element: HTMLElement;

  constructor() {
    this.element = createElement("div", { className: "app__controls" });
    this.element.appendChild(this.createPlaybackSection());
    this.element.appendChild(this.createMarkerSection());
  }

  private createPlaybackSection(): HTMLElement {
    const section = createElement("div", { className: "controls__playback" });
    section.appendChild(this.createButton("⏮", "最初から", true));
    section.appendChild(this.createButton("▶", "再生", true));
    section.appendChild(this.createButton("⏸", "一時停止", true));
    section.appendChild(this.createButton("⏹", "停止", true));

    const range = createElement("input", {
      attr: { type: "range", min: "0", max: "100", value: "0" }
    }) as HTMLInputElement;
    range.disabled = true;
    section.appendChild(range);

    const speedSelect = createElement("select") as HTMLSelectElement;
    [0.5, 1, 2, 4].forEach((speed) => {
      speedSelect.appendChild(
        createElement("option", { textContent: `${speed}×`, attr: { value: speed.toString() } })
      );
    });
    speedSelect.value = "1";
    speedSelect.disabled = true;
    section.appendChild(speedSelect);

    return section;
  }

  private createMarkerSection(): HTMLElement {
    const section = createElement("div", { className: "controls__markers" });
    section.appendChild(this.createButton("区間開始", "現在の時刻を区間開始に設定", true));
    section.appendChild(this.createButton("区間終了", "現在の時刻を区間終了に設定", true));
    return section;
  }

  private createButton(label: string, title: string, disabled = false): HTMLButtonElement {
    const button = createElement("button", { textContent: label, attr: { title } }) as HTMLButtonElement;
    button.disabled = disabled;
    return button;
  }
}
