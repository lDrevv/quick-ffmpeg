const { ipcRenderer, clipboard } = require('electron');

function appendToLog(message) {
  const log = document.getElementById('statusLog');
  const entry = document.createElement('div');
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function showError(message) {
  const modal = document.getElementById('errorModal');
  document.getElementById('errorMessage').textContent = message;
  modal.style.display = 'block';
}

document.getElementById('encodeBtn').addEventListener('click', () => {
  const videoInput = document.getElementById('videoInput');
  const targetSize = document.getElementById('targetSize').value;
  const codec = document.getElementById('codecSelect').value;
  const muteAudio = document.getElementById('muteAudio').checked;
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  const progressContainer = document.querySelector('.progress-container');

  if (!videoInput.files[0]) {
    showError('Please select a video file!');
    return;
  }

  appendToLog('Encoding started...');
  progressContainer.style.display = 'flex';
  document.getElementById('encodeBtn').style.display = 'none';
  document.getElementById('cancelBtn').style.display = 'block';

  ipcRenderer.send('encode-video', {
    inputFile: videoInput.files[0].path,
    targetSize: parseInt(targetSize),
    codec: codec,
    muteAudio: muteAudio,
    startTime: startTime ? parseInt(startTime) : null,
    endTime: endTime ? parseInt(endTime) : null
  });
});

document.getElementById('videoInput').addEventListener('change', (e) => {
  const fileName = e.target.files[0] ? e.target.files[0].name : 'No file selected';
  document.getElementById('fileName').textContent = fileName;
  if (e.target.files[0]) {
    ipcRenderer.send('get-duration', e.target.files[0].path);
  }
});

document.querySelector('.minimize').addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

document.querySelector('.close').addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  const settingsPanel = document.getElementById('settingsPanel');
  settingsPanel.classList.toggle('open');
  if (settingsPanel.classList.contains('open')) {
    ipcRenderer.send('check-versions');
  }
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  const settingsPanel = document.getElementById('settingsPanel');
  settingsPanel.classList.remove('open');
});

document.getElementById('pasteYtdlpBtn').addEventListener('click', () => {
  const downloadUrl = document.getElementById('downloadUrl');
  downloadUrl.value = clipboard.readText();
});

document.getElementById('downloadYtdlpBtn').addEventListener('click', () => {
  const url = document.getElementById('downloadUrl').value;
  const targetSize = document.getElementById('targetSize').value;
  const codec = document.getElementById('codecSelect').value;
  const muteAudio = document.getElementById('muteAudio').checked;
  const startTime = document.getElementById('startTime').value;
  const endTime = document.getElementById('endTime').value;
  const progressContainer = document.querySelector('.progress-container');

  if (!url) {
    showError('Please enter a video URL!');
    return;
  }

  appendToLog('Downloading started...');
  progressContainer.style.display = 'flex';
  document.getElementById('encodeBtn').style.display = 'none';
  document.getElementById('cancelBtn').style.display = 'block';

  ipcRenderer.send('download-ytdlp', {
    url: url,
    targetSize: parseInt(targetSize),
    codec: codec,
    muteAudio: muteAudio,
    startTime: startTime ? parseInt(startTime) : null,
    endTime: endTime ? parseInt(endTime) : null
  });
});

document.getElementById('cancelBtn').addEventListener('click', () => {
  ipcRenderer.send('cancel-process');
  appendToLog('Process cancelled.');
  document.querySelector('.progress-container').style.display = 'none';
  document.getElementById('encodeBtn').style.display = 'block';
  document.getElementById('cancelBtn').style.display = 'none';
});

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('errorModal').style.display = 'none';
});

document.querySelectorAll('.number-btn').forEach(button => {
  button.addEventListener('click', (e) => {
    const input = e.target.previousElementSibling.tagName === 'INPUT'
      ? e.target.previousElementSibling
      : e.target.previousElementSibling.previousElementSibling;
    const step = parseInt(input.step) || 1;
    const min = parseInt(input.min) || 0;
    let value = parseInt(input.value) || 0;

    if (e.target.classList.contains('plus')) {
      input.value = value + step;
    } else if (e.target.classList.contains('minus')) {
      value = Math.max(min, value - step);
      input.value = value;
    }
  });
});

document.querySelectorAll('.preset-btn').forEach(button => {
  button.addEventListener('click', () => {
    const size = button.getAttribute('data-size');
    document.getElementById('targetSize').value = size;
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
  });
});

let isLightMode = false;
document.getElementById('themeBtn').addEventListener('click', () => {
  isLightMode = !isLightMode;
  document.body.classList.toggle('light', isLightMode);
  document.querySelector('.window').classList.toggle('light', isLightMode);
  document.querySelector('.title-bar').classList.toggle('light', isLightMode);
  document.querySelector('.title').classList.toggle('light', isLightMode);
  document.querySelectorAll('.window-btn').forEach(btn => btn.classList.toggle('light', isLightMode));
  document.querySelector('.settings-panel').classList.toggle('light', isLightMode);
  document.querySelectorAll('input[type="number"], input[type="text"], select').forEach(el => el.classList.toggle('light', isLightMode));
  document.querySelectorAll('.number-btn').forEach(btn => btn.classList.toggle('light', isLightMode));
  document.querySelectorAll('.version-btn').forEach(btn => btn.classList.toggle('light', isLightMode));
  document.querySelector('.custom-file-button').classList.toggle('light', isLightMode);
  document.querySelector('.settings-btn').classList.toggle('light', isLightMode);
  document.querySelectorAll('.action-btn').forEach(btn => btn.classList.toggle('light', isLightMode));
  document.querySelector('.progress-bar').classList.toggle('light', isLightMode);
  document.querySelector('.status-log').classList.toggle('light', isLightMode);
  document.querySelector('.modal-content').classList.toggle('light', isLightMode);
  document.querySelector('.close-modal').classList.toggle('light', isLightMode);
  document.querySelector('.theme-btn').classList.toggle('light', isLightMode);
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.preset-btn[data-size="10"]').classList.add('active');
});

ipcRenderer.on('versions', (event, { appVersion, ffmpegVersion }) => {
  document.getElementById('appVersion').textContent = `App: ${appVersion}`;
  document.getElementById('ffmpegVersion').textContent = `FFmpeg: ${ffmpegVersion}`;
});

ipcRenderer.on('versions-error', (event, error) => {
  document.getElementById('ffmpegVersion').textContent = `FFmpeg: Error - ${error}`;
});

ipcRenderer.on('download-progress', (event, { percent, eta, bitrate, speed }) => {
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const timeText = document.getElementById('timeText');
  const bitrateText = document.getElementById('bitrateText');
  const speedText = document.getElementById('speedText');
  
  const roundedPercent = Math.round(percent);
  progressFill.style.width = `${roundedPercent}%`;
  progressText.textContent = `${roundedPercent}%`;
  timeText.textContent = `ETA: ${eta !== undefined ? eta + 's' : 'N/A'}`;
  bitrateText.textContent = `Bitrate: ${bitrate}kbits/s`;
  speedText.textContent = `Speed: ${speed}x`;
});

ipcRenderer.on('download-complete', (event, outputFile) => {
  appendToLog(`Downloaded and saved as: ${outputFile.split('/').pop()}`);
  document.querySelector('.progress-container').style.display = 'none';
  document.getElementById('encodeBtn').style.display = 'block';
  document.getElementById('cancelBtn').style.display = 'none';
});

ipcRenderer.on('download-error', (event, error) => {
  showError(`Error: ${error}`);
  document.querySelector('.progress-container').style.display = 'none';
  document.getElementById('encodeBtn').style.display = 'block';
  document.getElementById('cancelBtn').style.display = 'none';
});

ipcRenderer.on('encode-progress', (event, { percent, eta, bitrate, speed }) => {
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const timeText = document.getElementById('timeText');
  const bitrateText = document.getElementById('bitrateText');
  const speedText = document.getElementById('speedText');
  
  const roundedPercent = Math.round(percent);
  progressFill.style.width = `${roundedPercent}%`;
  progressText.textContent = `${roundedPercent}%`;
  timeText.textContent = `ETA: ${eta !== undefined ? eta + 's' : 'N/A'}`;
  bitrateText.textContent = `Bitrate: ${bitrate}kbits/s`;
  speedText.textContent = `Speed: ${speed}x`;
});

ipcRenderer.on('encode-complete', (event, outputFile) => {
  appendToLog(`Saved as: ${outputFile.split('/').pop()}`);
  document.querySelector('.progress-container').style.display = 'none';
  document.getElementById('encodeBtn').style.display = 'block';
  document.getElementById('cancelBtn').style.display = 'none';
});

ipcRenderer.on('encode-error', (event, error) => {
  showError(`Error: ${error}`);
  document.querySelector('.progress-container').style.display = 'none';
  document.getElementById('encodeBtn').style.display = 'block';
  document.getElementById('cancelBtn').style.display = 'none';
});

ipcRenderer.on('duration', (event, duration) => {
  document.getElementById('endTime').value = Math.round(duration);
});

ipcRenderer.on('duration-error', (event, error) => {
  showError(`Duration detection failed: ${error}`);
});

// New version notification listener
ipcRenderer.on('new-version-available', (event, { version, url }) => {
  appendToLog(`New version v${version} available! Download it from: ${url}`);
});
