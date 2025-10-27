const worker = new Worker('./worker/slamWorker.js', { type: 'module' });

export function createWorkerBridge(handlers) {
  worker.onmessage = event => {
    const { type } = event.data;
    switch (type) {
      case 'POSE':
        handlers.onPose?.(event.data.pose, event.data.stamp);
        break;
      case 'GRID_FRAME':
        handlers.onGridFrame?.(event.data.imageBitmap, event.data.stamp);
        break;
      case 'STATS':
        handlers.onStats?.(event.data.stats);
        break;
      case 'EXPORT_DONE':
        handlers.onExportDone?.(event.data.files);
        break;
      case 'ERROR':
        handlers.onError?.(event.data.code, event.data.message);
        break;
      default:
        console.warn('Unknown worker message', event.data);
    }
  };

  return {
    openFile(file) {
      worker.postMessage({ type: 'OPEN', file });
    },
    setTopics(topics) {
      worker.postMessage({ type: 'SET_TOPICS', ...topics });
    },
    sendConfig(config) {
      worker.postMessage({ type: 'CONFIG', config });
    },
    play(speed) {
      worker.postMessage({ type: 'PLAY', speed });
    },
    pause() {
      worker.postMessage({ type: 'PAUSE' });
    },
    stop() {
      worker.postMessage({ type: 'STOP' });
    },
    setSpeed(speed) {
      worker.postMessage({ type: 'SET_SPEED', speed });
    },
    markStart() {
      worker.postMessage({ type: 'MARK_START' });
    },
    markEnd() {
      worker.postMessage({ type: 'MARK_END' });
    },
    exportNow() {
      worker.postMessage({ type: 'EXPORT_NOW' });
    },
    exportRange() {
      worker.postMessage({ type: 'EXPORT_RANGE' });
    }
  };
}
