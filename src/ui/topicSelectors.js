const placeholderOptions = {
  scan: ['/scan', '/lidar/scan'],
  odom: ['/odom', '/base_pose_ground_truth'],
  tf: ['/tf', '/tf_static']
};

export function initTopicSelectors({ scan, odom, tf, applyButton, appState, onApply }) {
  populate(scan, placeholderOptions.scan);
  populate(odom, ['未使用'].concat(placeholderOptions.odom));
  populate(tf, ['未使用'].concat(placeholderOptions.tf));

  const updateButtonState = () => {
    applyButton.disabled = !scan.value;
  };

  [scan, odom, tf].forEach(select => {
    select.addEventListener('change', updateButtonState);
  });

  applyButton.addEventListener('click', () => {
    const topics = {
      scan: scan.value,
      odom: odom.value === '未使用' ? null : odom.value,
      tf: tf.value === '未使用' ? null : tf.value
    };
    appState.setTopics(topics);
    onApply(topics);
  });

  appState.on('file', () => {
    // TODO: Replace with actual bag metadata detection.
    applyButton.disabled = false;
  });

  updateButtonState();
}

function populate(select, values) {
  select.innerHTML = '';
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}
