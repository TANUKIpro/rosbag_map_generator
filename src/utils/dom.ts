interface ElementOptions {
  className?: string;
  innerHTML?: string;
  textContent?: string;
  attr?: Record<string, string>;
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.innerHTML) el.innerHTML = options.innerHTML;
  if (options.textContent) el.textContent = options.textContent;
  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

export function createFieldset(title: string): HTMLDivElement {
  const wrapper = createElement("div");
  const heading = createElement("h2", {
    textContent: title
  });
  heading.style.margin = "0 0 0.75rem";
  heading.style.fontSize = "1rem";
  wrapper.appendChild(heading);
  return wrapper;
}
