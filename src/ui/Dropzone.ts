import { createElement } from "../utils/dom";

export class Dropzone {
  readonly element: HTMLElement;
  private readonly fileInput: HTMLInputElement;

  constructor() {
    this.element = createElement("div", {
      className: "dropzone",
      innerHTML: "<strong>ファイルをドロップ</strong> または クリックして選択"
    });

    this.fileInput = createElement("input", {
      attr: { type: "file", accept: ".bag,.mcap" }
    }) as HTMLInputElement;
    this.fileInput.style.display = "none";
    this.element.appendChild(this.fileInput);

    this.bindEvents();
  }

  private bindEvents(): void {
    this.element.addEventListener("click", () => this.fileInput.click());
    this.fileInput.addEventListener("change", (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (file) {
        this.element.dispatchEvent(new CustomEvent<File>("dropzone:file", { detail: file }));
      }
    });

    this.element.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      this.element.classList.add("dropzone--active");
    });

    this.element.addEventListener("dragleave", () => {
      this.element.classList.remove("dropzone--active");
    });

    this.element.addEventListener("drop", (ev) => {
      ev.preventDefault();
      this.element.classList.remove("dropzone--active");
      const file = ev.dataTransfer?.files?.[0];
      if (file) {
        this.element.dispatchEvent(new CustomEvent<File>("dropzone:file", { detail: file }));
      }
    });
  }
}
