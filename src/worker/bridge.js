console.log('[bridge] Creating worker from: ./src/worker/slamWorker.js');
const worker = new Worker('./src/worker/slamWorker.js', { type: 'module' });
console.log('[bridge] Worker instance created');

// エラーハンドリング
worker.onerror = (error) => {
  console.error('[bridge] ========== WORKER ERROR ==========');
  console.error('[bridge] Worker error:', error);
  console.error('[bridge] Message:', error.message);
  console.error('[bridge] Filename:', error.filename);
  console.error('[bridge] Line:', error.lineno);
  console.error('[bridge] Worker failed to load. Check the path and syntax.');
};

export function createWorkerBridge(handlers, debugPanel = null) {
  console.log('[bridge] Setting up worker message handler');

  worker.onmessage = event => {
    const { type } = event.data;
    console.log('[bridge] Received from worker:', type, event.data);

    switch (type) {
      case 'DEBUG_LOG':
        // Forward worker logs to debug panel
        if (debugPanel) {
          debugPanel.logMessage('WORKER', `${event.data.level}: ${event.data.message}`, event.data.level.toLowerCase());
        }
        break;
      case 'TOPICS_AVAILABLE':
        console.log('[bridge] Processing TOPICS_AVAILABLE:', event.data.topics);
        handlers.onTopicsAvailable?.(event.data.topics);
        break;
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
      debugPanel?.recordBridgeMessage('OPEN', { name: file?.name });
      worker.postMessage({ type: 'OPEN', file });
    },
    setTopics(topics) {
      console.log('[bridge] Sending SET_TOPICS to worker:', topics);
      debugPanel?.recordBridgeMessage('SET_TOPICS', topics);
      worker.postMessage({ type: 'SET_TOPICS', ...topics });
    },
    sendConfig(config) {
      console.log('[bridge] Sending CONFIG to worker:', config);
      debugPanel?.recordBridgeMessage('CONFIG', config);
      worker.postMessage({ type: 'CONFIG', config });
    },
    play(speed) {
      console.log('[bridge] Sending PLAY to worker, speed:', speed);
      debugPanel?.recordBridgeMessage('PLAY', { speed });
      worker.postMessage({ type: 'PLAY', speed });
    },
    pause() {
      console.log('[bridge] Sending PAUSE to worker');
      debugPanel?.recordBridgeMessage('PAUSE', {});
      worker.postMessage({ type: 'PAUSE' });
    },
    stop() {
      console.log('[bridge] Sending STOP to worker');
      debugPanel?.recordBridgeMessage('STOP', {});
      worker.postMessage({ type: 'STOP' });
    },
    setSpeed(speed) {
      console.log('[bridge] Sending SET_SPEED to worker:', speed);
      debugPanel?.recordBridgeMessage('SET_SPEED', { speed });
      worker.postMessage({ type: 'SET_SPEED', speed });
    },
    markStart() {
      console.log('[bridge] Sending MARK_START to worker');
      debugPanel?.recordBridgeMessage('MARK_START', {});
      worker.postMessage({ type: 'MARK_START' });
    },
    markEnd() {
      console.log('[bridge] Sending MARK_END to worker');
      debugPanel?.recordBridgeMessage('MARK_END', {});
      worker.postMessage({ type: 'MARK_END' });
    },
    exportNow() {
      console.log('[bridge] Sending EXPORT_NOW to worker');
      debugPanel?.recordBridgeMessage('EXPORT_NOW', {});
      worker.postMessage({ type: 'EXPORT_NOW' });
    },
    exportRange() {
      console.log('[bridge] Sending EXPORT_RANGE to worker');
      debugPanel?.recordBridgeMessage('EXPORT_RANGE', {});
      worker.postMessage({ type: 'EXPORT_RANGE' });
    }
  };
}
