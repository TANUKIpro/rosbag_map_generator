const worker = new Worker('./worker/slamWorker.js', { type: 'module' });

export function createWorkerBridge(handlers) {
  worker.onmessage = event => {
    const { type } = event.data;
    console.log('[bridge] Received from worker:', type, event.data);

    switch (type) {
      case 'POSE':
        console.log('[bridge] Processing POSE:', event.data.pose);
        handlers.onPose?.(event.data.pose, event.data.stamp);
        break;
      case 'GRID_FRAME':
        console.log('[bridge] Processing GRID_FRAME, imageBitmap:', event.data.imageBitmap);
        handlers.onGridFrame?.(event.data.imageBitmap, event.data.stamp);
        break;
      case 'STATS':
        console.log('[bridge] Processing STATS:', event.data.stats);
        handlers.onStats?.(event.data.stats);
        break;
      case 'EXPORT_DONE':
        console.log('[bridge] Processing EXPORT_DONE');
        handlers.onExportDone?.(event.data.files);
        break;
      case 'ERROR':
        console.log('[bridge] Processing ERROR:', event.data.code, event.data.message);
        handlers.onError?.(event.data.code, event.data.message);
        break;
      default:
        console.warn('[bridge] Unknown worker message', event.data);
    }
  };

  return {
    openFile(file) {
      console.log('[bridge] Sending OPEN to worker, file:', file?.name);
      worker.postMessage({ type: 'OPEN', file });
    },
    setTopics(topics) {
      console.log('[bridge] Sending SET_TOPICS to worker:', topics);
      worker.postMessage({ type: 'SET_TOPICS', ...topics });
    },
    sendConfig(config) {
      console.log('[bridge] Sending CONFIG to worker:', config);
      worker.postMessage({ type: 'CONFIG', config });
    },
    play(speed) {
      console.log('[bridge] Sending PLAY to worker, speed:', speed);
      worker.postMessage({ type: 'PLAY', speed });
    },
    pause() {
      console.log('[bridge] Sending PAUSE to worker');
      worker.postMessage({ type: 'PAUSE' });
    },
    stop() {
      console.log('[bridge] Sending STOP to worker');
      worker.postMessage({ type: 'STOP' });
    },
    setSpeed(speed) {
      console.log('[bridge] Sending SET_SPEED to worker:', speed);
      worker.postMessage({ type: 'SET_SPEED', speed });
    },
    markStart() {
      console.log('[bridge] Sending MARK_START to worker');
      worker.postMessage({ type: 'MARK_START' });
    },
    markEnd() {
      console.log('[bridge] Sending MARK_END to worker');
      worker.postMessage({ type: 'MARK_END' });
    },
    exportNow() {
      console.log('[bridge] Sending EXPORT_NOW to worker');
      worker.postMessage({ type: 'EXPORT_NOW' });
    },
    exportRange() {
      console.log('[bridge] Sending EXPORT_RANGE to worker');
      worker.postMessage({ type: 'EXPORT_RANGE' });
    }
  };
}
