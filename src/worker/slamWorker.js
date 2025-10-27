self.addEventListener('message', async event => {
  const { type } = event.data;
  switch (type) {
    case 'OPEN':
      self.postMessage({ type: 'STATS', stats: { fps: 0, wasmMs: 0, memMB: estimateMemoryMB() } });
      break;
    case 'SET_TOPICS':
    case 'CONFIG':
    case 'PLAY':
    case 'PAUSE':
    case 'STOP':
    case 'SET_SPEED':
    case 'MARK_START':
    case 'MARK_END':
      console.debug('[worker]', type, event.data);
      break;
    case 'EXPORT_NOW':
    case 'EXPORT_RANGE':
      fakeExport();
      break;
    default:
      console.warn('[worker] Unknown message', event.data);
  }
});

function fakeExport() {
  const pgmHeader = 'P5\n2 2\n255\n';
  const pgmBody = new Uint8Array([0, 127, 200, 255]);
  const pgmBlob = new Blob([pgmHeader, pgmBody], { type: 'image/x-portable-graymap' });
  const yamlContent = `image: map.pgm\nresolution: 0.05\norigin: [0, 0, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`;
  const yamlBlob = new Blob([yamlContent], { type: 'text/yaml' });
  self.postMessage({ type: 'EXPORT_DONE', files: { pgm: pgmBlob, yaml: yamlBlob } });
}

function estimateMemoryMB() {
  if (self.performance && self.performance.memory) {
    return self.performance.memory.usedJSHeapSize / (1024 * 1024);
  }
  return 0;
}
