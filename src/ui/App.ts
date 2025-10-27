import { Dropzone } from "./Dropzone";
import { TopicSelector } from "./TopicSelector";
import { SettingsPanel } from "./SettingsPanel";
import { PlaybackControls } from "./PlaybackControls";
import { StatsPanel } from "./StatsPanel";

export class App {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly dropzone: Dropzone;
  private readonly topicSelector: TopicSelector;
  private readonly settings: SettingsPanel;
  private readonly playback: PlaybackControls;
  private readonly stats: StatsPanel;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "app";

    const header = document.createElement("header");
    header.className = "app__header";
    this.dropzone = new Dropzone();
    header.appendChild(this.dropzone.element);

    const exportButtons = document.createElement("div");
    exportButtons.className = "export-buttons";
    const exportNow = document.createElement("button");
    exportNow.textContent = "今すぐエクスポート";
    exportNow.classList.add("primary");
    exportNow.disabled = true;
    exportButtons.appendChild(exportNow);

    const exportRange = document.createElement("button");
    exportRange.textContent = "区間再生成→エクスポート";
    exportRange.disabled = true;
    exportButtons.appendChild(exportRange);

    header.appendChild(exportButtons);
    this.element.appendChild(header);

    const sidebar = document.createElement("aside");
    sidebar.className = "app__sidebar";
    this.topicSelector = new TopicSelector();
    sidebar.appendChild(this.topicSelector.element);

    this.settings = new SettingsPanel();
    sidebar.appendChild(this.settings.element);
    this.element.appendChild(sidebar);

    const main = document.createElement("main");
    main.className = "app__main";
    const canvasWrapper = document.createElement("div");
    canvasWrapper.className = "canvas-wrapper";
    this.canvas = document.createElement("canvas");
    this.canvas.width = 512;
    this.canvas.height = 512;
    canvasWrapper.appendChild(this.canvas);
    main.appendChild(canvasWrapper);

    this.stats = new StatsPanel();
    main.appendChild(this.stats.element);
    this.element.appendChild(main);

    this.playback = new PlaybackControls();
    this.element.appendChild(this.playback.element);

    this.bindMockPreview();
  }

  private bindMockPreview(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
    gradient.addColorStop(0, "#0c1927");
    gradient.addColorStop(1, "#1f6feb");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const text = "地図プレビュー";
    ctx.font = "32px Inter";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    const metrics = ctx.measureText(text);
    ctx.fillText(text, (this.canvas.width - metrics.width) / 2, this.canvas.height / 2);
  }
}
