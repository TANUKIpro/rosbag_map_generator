export function initConfigPanel({ resolution, width, height, downsample, applyButton, appState, onSubmit }) {
  applyButton.addEventListener('click', () => {
    const config = {
      resolution: clamp(parseFloat(resolution.value), 0.01, 1.0),
      width: clamp(parseFloat(width.value), 1, 500),
      height: clamp(parseFloat(height.value), 1, 500),
      downsample: Math.max(1, Math.round(parseFloat(downsample.value) || 1))
    };
    onSubmit(config);
  });

  appState.on('file', () => {
    applyButton.disabled = false;
  });

  applyButton.disabled = true;
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}
