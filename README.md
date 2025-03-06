# Quick FFmpeg

A lightweight Electron application for encoding videos to a target file size and downloading videos from URLs using FFmpeg and yt-dlp. Features a modern UI with light/dark mode, progress tracking, and customizable options.

## Features
- Encode videos to a specific size (e.g., 10MB, 25MB, 50MB) with preset buttons.
- Download videos from YouTube, X, and other supported platforms.
- Supports multiple codecs (VP9, H.264, H.265, AV1).
- Trim videos by start/end time.
- Mute audio option.
- Unified progress bar with ETA for encoding and downloading.
- Light/dark mode toggle.
- Status log and error popups for feedback.

## Prerequisites
- [Node.js](https://nodejs.org/) (v16 or later recommended)
- [FFmpeg](https://ffmpeg.org/download.html) installed and accessible in your PATH
- [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) installed and accessible in your PATH

## Installation
1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/quick-ffmpeg.git
   cd quick-ffmpeg
