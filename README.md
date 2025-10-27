# rosbag_map_generator

`rosbag_map_generator` is a fully in-browser tool for generating 2D occupancy grid maps from ROS bag files without relying on a backend service.

This repository currently contains the product vision, requirements, and architecture outline for the MVP. Implementation work is tracked directly in the source tree (`src/`).

## Getting started

Open `index.html` in a modern Chromium, Firefox, or Edge browser. The MVP is under active development; core functionality is stubbed but the user interface and messaging pipeline are scaffolded to match the specification.

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
