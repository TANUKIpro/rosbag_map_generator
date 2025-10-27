export function initPlaybackControls({
  play,
  pause,
  stop,
  speed,
  markStart,
  markEnd,
  exportNow,
  exportRange,
  appState,
  toast,
  bridge
}) {
  const enableControls = enabled => {
    for (const button of [play, pause, stop, speed, markStart, markEnd, exportNow, exportRange]) {
      button.disabled = !enabled;
    }
  };

  play.addEventListener('click', () => bridge.play(Number(speed.value)));
  pause.addEventListener('click', () => bridge.pause());
  stop.addEventListener('click', () => bridge.stop());
  speed.addEventListener('change', () => bridge.setSpeed(Number(speed.value)));
  markStart.addEventListener('click', () => bridge.markStart());
  markEnd.addEventListener('click', () => bridge.markEnd());
  exportNow.addEventListener('click', () => bridge.exportNow());
  exportRange.addEventListener('click', () => bridge.exportRange());

  appState.on('file', () => {
    enableControls(true);
    toast.show('再生コントロールが利用可能になりました', 'info');
  });

  enableControls(false);
}
