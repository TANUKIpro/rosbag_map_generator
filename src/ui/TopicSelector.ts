import { createElement, createFieldset } from "../utils/dom";

const TOPIC_LABELS: Record<string, string> = {
  scan: "LiDAR (LaserScan)",
  odom: "オドメトリ (Odometry)",
  tf: "TF"
};

export class TopicSelector {
  readonly element: HTMLElement;
  private readonly selects: Record<string, HTMLSelectElement> = {};

  constructor() {
    this.element = createFieldset("トピック選択");
    this.element.classList.add("topic-select");

    for (const key of Object.keys(TOPIC_LABELS)) {
      const field = createElement("div");
      const label = createElement("label", { textContent: TOPIC_LABELS[key] });
      const select = createElement("select") as HTMLSelectElement;
      select.disabled = true;
      select.appendChild(createElement("option", { textContent: "未検出" }));
      field.appendChild(label);
      field.appendChild(select);
      this.element.appendChild(field);
      this.selects[key] = select;
    }
  }

  setTopics(topics: Record<string, string[]>): void {
    (Object.keys(topics) as Array<keyof typeof TOPIC_LABELS>).forEach((key) => {
      const select = this.selects[key];
      select.innerHTML = "";
      if (!topics[key]?.length) {
        select.disabled = true;
        select.appendChild(createElement("option", { textContent: "未検出" }));
      } else {
        select.disabled = false;
        for (const topic of topics[key] ?? []) {
          select.appendChild(createElement("option", { textContent: topic, attr: { value: topic } }));
        }
      }
    });
  }
}
