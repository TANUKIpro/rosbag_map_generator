class Emitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(fn);
    this.listeners.set(event, arr);
  }

  emit(event, payload) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (const fn of arr) fn(payload);
  }
}

export class AppState extends Emitter {
  constructor() {
    super();
    this.file = null;
    this.topics = { scan: null, odom: null, tf: null };
  }

  setFile(file) {
    this.file = file;
    this.emit('file', { file });
  }

  setTopics(topics) {
    this.topics = topics;
    this.emit('topics', topics);
  }

  updatePose(stamp, pose) {
    this.pose = { stamp, pose };
    this.emit('pose', { stamp, pose });
  }

  updateGridFrame(stamp, imageBitmap) {
    this.emit('gridFrame', { stamp, imageBitmap });
  }

  updateStats(stats) {
    this.stats = stats;
    this.emit('stats', stats);
  }

  handleExport(files, toast) {
    const { pgm, yaml } = files;
    downloadBlob(pgm, 'map.pgm');
    downloadBlob(yaml, 'map.yaml');
    toast.show('map.pgm / map.yaml をダウンロードしました', 'success');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
