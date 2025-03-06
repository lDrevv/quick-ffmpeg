const { app, BrowserWindow, ipcMain } = require('electron');
const ffmpeg = require('fluent-ffmpeg');
const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const https = require('https');

const verbs = ['Shiny', 'Smooth', 'Quick', 'Bright', 'Silent', 'Swift', 'Bold', 'Gentle', 'Fierce', 'Calm'];
const nouns = ['Dragon', 'Eagle', 'River', 'Forest', 'Mountain', 'Wolf', 'Sky', 'Lake', 'Tiger', 'Cloud'];

function generateRandomName(url = null) {
  const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const verb1 = randomItem(verbs);
  const noun1 = randomItem(nouns);
  const verb2 = randomItem(verbs);
  const noun2 = randomItem(nouns);
  
  let source = 'File';
  if (url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) source = 'YT';
    else if (url.includes('x.com') || url.includes('twitter.com')) source = 'X';
  }

  return `${verb1}${noun1}${verb2}${noun2}-${source}`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'),
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: false,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    transparent: true,
    vibrancy: 'dark',
    icon: path.join(__dirname, 'icon.png')
  });

  win.loadFile('index.html');
  
  ipcMain.on('minimize-window', () => win.minimize());
  ipcMain.on('close-window', () => win.close());

  // Check for new version after window is created
  checkForNewVersion();
}

function checkForNewVersion() {
  const currentVersion = app.getVersion();
  console.log(`Current local version: ${currentVersion}`); // Debug log

  const options = {
    hostname: 'api.github.com',
    path: '/repos/lDrevv/quick-ffmpeg/contents/package.json', // Fetch package.json
    method: 'GET',
    headers: {
      'User-Agent': 'Quick-FFmpeg', // Required by GitHub API
      'Accept': 'application/vnd.github.v3.raw' // Get raw file content
    }
  };

  const req = https.request(options, (res) => {
    console.log(`GitHub API response status: ${res.statusCode}`); // Debug log
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const packageJson = JSON.parse(data);
        const latestVersion = packageJson.version;
        console.log(`Latest version from GitHub: ${latestVersion}`); // Debug log
        console.log(`Comparing ${latestVersion} > ${currentVersion}: ${compareVersions(latestVersion, currentVersion)}`); // Debug log

        if (compareVersions(latestVersion, currentVersion) > 0) {
          console.log('New version detected, sending notification'); // Debug log
          const mainWindow = BrowserWindow.getAllWindows()[0];
          mainWindow.webContents.send('new-version-available', {
            version: latestVersion,
            url: 'https://github.com/lDrevv/quick-ffmpeg/releases' // Point to releases
          });
        } else {
          console.log('No new version available'); // Debug log
        }
      } catch (err) {
        console.error('Error parsing package.json from GitHub:', err);
        const mainWindow = BrowserWindow.getAllWindows()[0];
        mainWindow.webContents.send('version-check-error', 'Failed to parse GitHub package.json');
      }
    });
  });

  req.on('error', (err) => {
    console.error('Error fetching package.json from GitHub:', err);
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow.webContents.send('version-check-error', `Failed to fetch package.json: ${err.message}`);
  });

  req.end();
}

// Simple version comparison function
function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let currentProcess = null;

ipcMain.on('encode-video', (event, { inputFile, targetSize, codec, muteAudio, startTime, endTime }) => {
  const randomName = generateRandomName();
  const outputFile = path.join(os.homedir(), 'Videos', `${randomName}-${targetSize}MB.mp4`);
  const threadCount = os.cpus().length;

  ffmpeg.ffprobe(inputFile, (err, metadata) => {
    if (err) {
      event.reply('encode-error', err.message);
      return;
    }

    const duration = metadata.format.duration;
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
    const audioBitrate = audioStream && !muteAudio ? parseInt(audioStream.bit_rate) / 1024 : 0;

    const minSize = (audioBitrate * duration) / 8192;
    if (targetSize < minSize) {
      event.reply('encode-error', `Target size ${targetSize}MB is too small! Minimum size: ${minSize.toFixed(2)}MB`);
      return;
    }

    const videoBitrate = ((targetSize * 8192) / (1.048576 * (endTime && startTime ? endTime - startTime : duration)) - audioBitrate);
    const isTwoPass = codec === 'libvpx-vp9' || codec === 'libx264' || codec === 'libx265';

    let encodeOptions = {
      videoCodec: codec,
      videoBitrate: videoBitrate,
      outputOptions: [`-speed 4`, `-threads ${threadCount}`]
    };

    if (!muteAudio && !isTwoPass) {
      encodeOptions.audioCodec = 'aac';
      encodeOptions.audioBitrate = audioBitrate;
    }

    if (startTime !== null) encodeOptions.outputOptions.push(`-ss ${startTime}`);
    if (endTime !== null) encodeOptions.outputOptions.push(`-to ${endTime}`);

    let currentProgress = { percent: 0, eta: 0, bitrate: 0, speed: 0 };
    let passCount = isTwoPass ? 2 : 1;
    let currentPass = 1;
    let totalDuration = endTime && startTime ? endTime - startTime : duration;

    const updateProgress = () => {
      event.reply('encode-progress', currentProgress);
    };

    const calculateProgress = (progressPercent) => {
      const passWeight = 1 / passCount;
      currentProgress.percent = ((currentPass - 1) * passWeight + (progressPercent / 100) * passWeight) * 100;
    };

    const calculateETA = (currentTime, speed) => {
      if (speed > 0) {
        const remainingTimeInCurrentPass = (totalDuration - currentTime) / speed;
        const remainingPasses = passCount - currentPass;
        const eta = remainingTimeInCurrentPass + (remainingPasses * totalDuration / speed);
        currentProgress.eta = Math.round(eta >= 0 ? eta : 0);
      }
    };

    const parseStderr = (data) => {
      const timeMatch = data.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      const speedMatch = data.match(/speed=(\d+\.\d+)x/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        if (speedMatch && parseFloat(speedMatch[1]) > 0) {
          calculateETA(currentTime, parseFloat(speedMatch[1]));
        }
      }
      if (speedMatch) {
        currentProgress.speed = Math.round(parseFloat(speedMatch[1]));
      }
      updateProgress();
    };

    const applyOptions = (command) => {
      if (muteAudio) command.noAudio();
      if (startTime !== null) command.seekInput(startTime);
      if (endTime !== null) command.duration(endTime - (startTime || 0));
      return command;
    };

    if (isTwoPass) {
      const firstPass = applyOptions(
        ffmpeg(inputFile)
          .videoCodec(codec)
          .videoBitrate(videoBitrate)
          .noAudio()
          .outputOptions([...encodeOptions.outputOptions, '-pass 1'])
          .format('mp4')
      );
      currentProcess = firstPass;

      firstPass
        .on('progress', progress => {
          currentProgress.bitrate = Math.round(progress.currentKbps || 0);
          calculateProgress(progress.percent);
          updateProgress();
        })
        .on('stderr', parseStderr)
        .on('error', err => event.reply('encode-error', err.message))
        .save('/dev/null')
        .on('end', () => {
          currentPass = 2;
          const secondPass = applyOptions(
            ffmpeg(inputFile)
              .videoCodec(codec)
              .videoBitrate(videoBitrate)
              .outputOptions([...encodeOptions.outputOptions, '-pass 2'])
          );
          currentProcess = secondPass;

          if (!muteAudio) {
            secondPass.audioCodec('aac').audioBitrate(audioBitrate);
          }

          secondPass
            .on('progress', progress => {
              currentProgress.bitrate = Math.round(progress.currentKbps || 0);
              calculateProgress(progress.percent);
              updateProgress();
            })
            .on('stderr', parseStderr)
            .on('error', err => event.reply('encode-error', err.message))
            .on('end', () => {
              currentProcess = null;
              event.reply('encode-complete', outputFile);
            })
            .save(outputFile);
        });
    } else {
      const singlePass = applyOptions(
        ffmpeg(inputFile)
          .videoCodec(codec)
          .videoBitrate(videoBitrate)
          .outputOptions(encodeOptions.outputOptions)
      );
      currentProcess = singlePass;

      if (!muteAudio) {
        singlePass.audioCodec('aac').audioBitrate(audioBitrate);
      }

      singlePass
        .on('progress', progress => {
          currentProgress.bitrate = Math.round(progress.currentKbps || 0);
          calculateProgress(progress.percent);
          updateProgress();
        })
        .on('stderr', parseStderr)
        .on('error', err => event.reply('encode-error', err.message))
        .on('end', () => {
          currentProcess = null;
          event.reply('encode-complete', outputFile);
        })
        .save(outputFile);
    }
  });
});

ipcMain.on('check-versions', (event) => {
  const appVersion = app.getVersion();
  exec('ffmpeg -version', (err, stdout, stderr) => {
    if (err) {
      event.reply('versions-error', err.message || 'FFmpeg not found');
      return;
    }
    const versionMatch = stdout.match(/ffmpeg version (\S+)/);
    if (versionMatch && versionMatch[1]) {
      event.reply('versions', { appVersion, ffmpegVersion: versionMatch[1] });
    } else {
      event.reply('versions-error', 'Could not parse FFmpeg version');
    }
  });
});

ipcMain.on('download-ytdlp', async (event, { url, targetSize, codec, muteAudio, startTime, endTime }) => {
  const videosDir = path.join(os.homedir(), 'Videos');
  const tempDir = path.join(os.homedir(), '.quick-ffmpeg', 'temp');
  const randomName = generateRandomName(url);
  const threadCount = os.cpus().length;
  
  await fs.mkdir(tempDir, { recursive: true });
  
  const tempFile = path.join(tempDir, `${randomName}.mp4`);
  const outputFile = path.join(videosDir, `${randomName}-${targetSize}MB.mp4`);

  const ytdlpArgs = [
    url,
    '-o', tempFile,
    '--merge-output-format', 'mp4',
    '-f', 'bestvideo+bestaudio/best',
    '--progress'
  ];
  if (startTime !== null) ytdlpArgs.push('--download-sections', `*${startTime}-${endTime || 'inf'}`);

  const ytdlp = spawn('yt-dlp', ytdlpArgs);
  currentProcess = ytdlp;

  let currentProgress = { percent: 0, eta: 0, bitrate: 0, speed: 0 };
  let downloadComplete = false;

  ytdlp.stdout.on('data', (data) => {
    const output = data.toString();
    const percentMatch = output.match(/(\d+\.\d+)%/);
    const timeMatch = output.match(/ETA (\d+):(\d+)/);
    const speedMatch = output.match(/@ (\d+\.\d+)MiB\/s/);
    if (percentMatch) currentProgress.percent = parseFloat(percentMatch[1]) * 0.5;
    if (timeMatch) {
      const eta = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
      currentProgress.eta = eta >= 0 ? eta * 2 : 0;
    }
    if (speedMatch) currentProgress.speed = parseFloat(speedMatch[1]);
    event.reply('download-progress', currentProgress);
  });

  ytdlp.stderr.on('data', (data) => {
    console.error(`yt-dlp stderr: ${data}`);
  });

  ytdlp.on('close', async (code) => {
    currentProcess = null;
    if (code !== 0) {
      event.reply('download-error', `yt-dlp exited with code ${code}`);
      return;
    }
    downloadComplete = true;

    try {
      const stats = await fs.stat(tempFile);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB <= targetSize) {
        await fs.rename(tempFile, path.join(videosDir, `${randomName}.mp4`));
        event.reply('download-complete', path.join(videosDir, `${randomName}.mp4`));
        event.reply('download-progress', { percent: 100, eta: 0, bitrate: 0, speed: 0 });
        return;
      }

      ffmpeg.ffprobe(tempFile, (err, metadata) => {
        if (err) {
          event.reply('download-error', err.message);
          return;
        }

        const duration = metadata.format.duration;
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const audioBitrate = audioStream && !muteAudio ? parseInt(audioStream.bit_rate) / 1024 : 0;

        const minSize = (audioBitrate * duration) / 8192;
        if (targetSize < minSize) {
          event.reply('download-error', `Target size ${targetSize}MB is too small! Minimum size: ${minSize.toFixed(2)}MB`);
          return;
        }

        const videoBitrate = ((targetSize * 8192) / (1.048576 * duration) - audioBitrate);
        const isTwoPass = codec === 'libvpx-vp9' || codec === 'libx264' || codec === 'libx265';
        let passCount = isTwoPass ? 2 : 1;
        let currentPass = 1;

        let encodeOptions = {
          videoCodec: codec,
          videoBitrate: videoBitrate,
          outputOptions: [`-speed 4`, `-threads ${threadCount}`]
        };

        if (!muteAudio && !isTwoPass) {
          encodeOptions.audioCodec = 'aac';
          encodeOptions.audioBitrate = audioBitrate;
        }

        const calculateEncodeProgress = (progressPercent) => {
          const passWeight = 0.5 / passCount;
          currentProgress.percent = 50 + ((currentPass - 1) * passWeight + (progressPercent / 100) * passWeight) * 100;
        };

        const calculateEncodeETA = (currentTime, speed) => {
          if (speed > 0) {
            const remainingTimeInCurrentPass = (duration - currentTime) / speed;
            const remainingPasses = passCount - currentPass;
            const eta = remainingTimeInCurrentPass + (remainingPasses * duration / speed);
            currentProgress.eta = Math.round(eta >= 0 ? eta : 0);
          }
        };

        const applyOptions = (command) => {
          if (muteAudio) command.noAudio();
          return command;
        };

        if (isTwoPass) {
          const firstPass = applyOptions(
            ffmpeg(tempFile)
              .videoCodec(codec)
              .videoBitrate(videoBitrate)
              .noAudio()
              .outputOptions([...encodeOptions.outputOptions, '-pass 1'])
              .format('mp4')
          );
          currentProcess = firstPass;

          firstPass
            .on('progress', progress => {
              currentProgress.bitrate = Math.round(progress.currentKbps || 0);
              calculateEncodeProgress(progress.percent);
              event.reply('download-progress', currentProgress);
            })
            .on('stderr', (data) => {
              const timeMatch = data.match(/time=(\d+):(\d+):(\d+\.\d+)/);
              const speedMatch = data.match(/speed=(\d+\.\d+)x/);
              if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = parseFloat(timeMatch[3]);
                const currentTime = hours * 3600 + minutes * 60 + seconds;
                if (speedMatch && parseFloat(speedMatch[1]) > 0) {
                  calculateEncodeETA(currentTime, parseFloat(speedMatch[1]));
                }
              }
              if (speedMatch) {
                currentProgress.speed = Math.round(parseFloat(speedMatch[1]));
              }
              event.reply('download-progress', currentProgress);
            })
            .on('error', async (err) => {
              event.reply('download-error', err.message);
              await fs.unlink(tempFile).catch(() => {});
            })
            .save('/dev/null')
            .on('end', () => {
              currentPass = 2;
              const secondPass = applyOptions(
                ffmpeg(tempFile)
                  .videoCodec(codec)
                  .videoBitrate(videoBitrate)
                  .outputOptions([...encodeOptions.outputOptions, '-pass 2'])
              );
              currentProcess = secondPass;

              if (!muteAudio) {
                secondPass.audioCodec('aac').audioBitrate(audioBitrate);
              }

              secondPass
                .on('progress', progress => {
                  currentProgress.bitrate = Math.round(progress.currentKbps || 0);
                  calculateEncodeProgress(progress.percent);
                  event.reply('download-progress', currentProgress);
                })
                .on('stderr', (data) => {
                  const timeMatch = data.match(/time=(\d+):(\d+):(\d+\.\d+)/);
                  const speedMatch = data.match(/speed=(\d+\.\d+)x/);
                  if (timeMatch) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = parseFloat(timeMatch[3]);
                    const currentTime = hours * 3600 + minutes * 60 + seconds;
                    if (speedMatch && parseFloat(speedMatch[1]) > 0) {
                      calculateEncodeETA(currentTime, parseFloat(speedMatch[1]));
                    }
                  }
                  if (speedMatch) {
                    currentProgress.speed = Math.round(parseFloat(speedMatch[1]));
                  }
                  event.reply('download-progress', currentProgress);
                })
                .on('error', async (err) => {
                  event.reply('download-error', err.message);
                  await fs.unlink(tempFile).catch(() => {});
                })
                .on('end', async () => {
                  currentProcess = null;
                  event.reply('download-complete', outputFile);
                  await fs.unlink(tempFile).catch((err) => console.error(`Failed to delete temp file: ${err}`));
                })
                .save(outputFile);
            });
        } else {
          const singlePass = applyOptions(
            ffmpeg(tempFile)
              .videoCodec(codec)
              .videoBitrate(videoBitrate)
              .outputOptions(encodeOptions.outputOptions)
          );
          currentProcess = singlePass;

          if (!muteAudio) {
            singlePass.audioCodec('aac').audioBitrate(audioBitrate);
          }

          singlePass
            .on('progress', progress => {
              currentProgress.bitrate = Math.round(progress.currentKbps || 0);
              calculateEncodeProgress(progress.percent);
              event.reply('download-progress', currentProgress);
            })
            .on('stderr', (data) => {
              const timeMatch = data.match(/time=(\d+):(\d+):(\d+\.\d+)/);
              const speedMatch = data.match(/speed=(\d+\.\d+)x/);
              if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = parseFloat(timeMatch[3]);
                const currentTime = hours * 3600 + minutes * 60 + seconds;
                if (speedMatch && parseFloat(speedMatch[1]) > 0) {
                  calculateEncodeETA(currentTime, parseFloat(speedMatch[1]));
                }
              }
              if (speedMatch) {
                currentProgress.speed = Math.round(parseFloat(speedMatch[1]));
              }
              event.reply('download-progress', currentProgress);
            })
            .on('error', async (err) => {
              event.reply('download-error', err.message);
              await fs.unlink(tempFile).catch(() => {});
            })
            .on('end', async () => {
              currentProcess = null;
              event.reply('download-complete', outputFile);
              await fs.unlink(tempFile).catch((err) => console.error(`Failed to delete temp file: ${err}`));
            })
            .save(outputFile);
        }
      });
    } catch (err) {
      event.reply('download-error', `File size check failed: ${err.message}`);
      await fs.unlink(tempFile).catch(() => {});
    }
  });
});

ipcMain.on('cancel-process', () => {
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
  }
});

ipcMain.on('get-duration', (event, inputFile) => {
  ffmpeg.ffprobe(inputFile, (err, metadata) => {
    if (err) {
      event.reply('duration-error', err.message);
    } else {
      event.reply('duration', metadata.format.duration);
    }
  });
});
