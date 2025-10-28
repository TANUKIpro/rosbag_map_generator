# rosbag_map_generator

`rosbag_map_generator` is a fully in-browser tool for generating 2D occupancy grid maps from ROS bag files without relying on a backend service.

This repository currently contains the product vision, requirements, and architecture outline for the MVP. Implementation work is tracked directly in the source tree (`src/`).

## Getting started

**⚠️ 重要: ローカルサーバーが必要です**

このアプリケーションはES6モジュールを使用しているため、`file:///` プロトコルで直接 `index.html` を開くと動作しません。必ずローカルサーバー経由でアクセスしてください。

### 方法1: Pythonサーバー（推奨）

```bash
python3 start-server.py
```

その後、ブラウザで [http://localhost:8000](http://localhost:8000) を開いてください。

### 方法2: Node.jsサーバー

```bash
npm run serve
```

その後、ブラウザで [http://localhost:8000](http://localhost:8000) を開いてください。

### 方法3: 手動でPythonサーバー起動

```bash
python3 -m http.server 8000
```

その後、ブラウザで [http://localhost:8000](http://localhost:8000) を開いてください。

## Development

* The application is a static site (no bundler required) built with modern ES modules.
* `src/main.js` owns UI bootstrapping and worker wiring.
* Web worker logic lives in `src/worker/slamWorker.js`.

To run a simple static server during development:

```bash
python -m http.server 5173
```

Then visit [http://localhost:5173](http://localhost:5173) in your browser.

## Project roadmap

The MVP targets the following milestones:

1. **M0** – File ingestion, topic selection UI, playback controls, and canvas preview placeholder.
2. **M1** – WebAssembly SLAM core (scan-matching without odometry) plus export to PGM/YAML.
3. **M2** – Odometry-aided ICP, interval export, and performance tuning.
4. **M3** – Offline-ready PWA packaging, error handling, UX polish.

See `docs/spec.md` for the full requirements document.
