'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface CinemaSceneSpec {
  id: string;
  index: number;
  title: string;
  narration: string;
  dialogueText: string;
  speaker: string;
  language: 'vi' | 'en';
  visualPrompt: string;
  cameraMotion: string;
  durationSec: number;
  audioPath?: string | null;
}

interface CinemaCanvasPlayerProps {
  scenes: CinemaSceneSpec[];
  styleName: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  showSubtitles: boolean;
  activeSceneIdx: number;
  isPlaying: boolean;
  onSceneChange: (nextIdx: number) => void;
  onPlayStateChange: (playing: boolean) => void;
  projectTitle: string;
}

interface ThemeColors {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  accent1: string;
  accent2: string;
  glow: string;
  particleType: 'neon_rain' | 'sakura_fireflies' | 'cinematic_dust' | 'bokeh_orbs';
}

function getStyleTheme(styleName: string, sceneIdx: number): ThemeColors {
  const s = styleName.toLowerCase();
  if (s.includes('cyberpunk')) {
    const palettes: ThemeColors[] = [
      {
        skyTop: '#050514',
        skyMid: '#180b38',
        skyBottom: '#082947',
        accent1: '#00f2fe',
        accent2: '#ff0844',
        glow: '#a855f7',
        particleType: 'neon_rain',
      },
      {
        skyTop: '#090418',
        skyMid: '#2a0845',
        skyBottom: '#0f172a',
        accent1: '#f43f5e',
        accent2: '#06b6d4',
        glow: '#ec4899',
        particleType: 'neon_rain',
      },
    ];
    return palettes[sceneIdx % palettes.length];
  }
  if (s.includes('anime')) {
    const palettes: ThemeColors[] = [
      {
        skyTop: '#0f172a',
        skyMid: '#312e81',
        skyBottom: '#f472b6',
        accent1: '#fde047',
        accent2: '#38bdf8',
        glow: '#f9a8d4',
        particleType: 'sakura_fireflies',
      },
      {
        skyTop: '#1e1b4b',
        skyMid: '#4c1d95',
        skyBottom: '#fb923c',
        accent1: '#fcd34d',
        accent2: '#a78bfa',
        glow: '#fbbf24',
        particleType: 'sakura_fireflies',
      },
    ];
    return palettes[sceneIdx % palettes.length];
  }
  if (s.includes('3d') || s.includes('cartoon')) {
    return {
      skyTop: '#0c4a6e',
      skyMid: '#0284c7',
      skyBottom: '#38bdf8',
      accent1: '#facc15',
      accent2: '#4ade80',
      glow: '#60a5fa',
      particleType: 'bokeh_orbs',
    };
  }
  // Realistic cinematic / default
  return {
    skyTop: '#04070d',
    skyMid: '#111e2e',
    skyBottom: '#2b1d14',
    accent1: '#f59e0b',
    accent2: '#38bdf8',
    glow: '#fb923c',
    particleType: 'cinematic_dust',
  };
}

export function CinemaCanvasPlayer({
  scenes,
  styleName,
  aspectRatio,
  showSubtitles,
  activeSceneIdx,
  isPlaying,
  onSceneChange,
  onPlayStateChange,
  projectTitle,
}: CinemaCanvasPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const loadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const width = aspectRatio === '16:9' ? 854 : 540;
  const height = aspectRatio === '16:9' ? 480 : aspectRatio === '1:1' ? 540 : 960;

  const currentScene = scenes[activeSceneIdx] || scenes[0];

  // Preload optional Pollinations AI artwork per scene when online (gracefully ignored if offline)
  useEffect(() => {
    scenes.forEach((sc) => {
      if (loadedImagesRef.current.has(sc.id)) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const promptSlug = encodeURIComponent(
        `${sc.visualPrompt.slice(0, 140)}, ${styleName}, masterpiece`
      );
      img.src = `https://image.pollinations.ai/prompt/${promptSlug}?width=${width}&height=${height}&nologo=true&seed=${sc.index + 101}`;
      img.onload = () => {
        loadedImagesRef.current.set(sc.id, img);
      };
    });
  }, [scenes, styleName, width, height]);

  // Speak via Web Speech API fallback or play scene audio file when playing
  useEffect(() => {
    if (!isPlaying || !currentScene) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    if (currentScene.audioPath && audioRef.current) {
      audioRef.current.src = `/api/storage/${currentScene.audioPath}`;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }

    // Also trigger browser neural SpeechSynthesis if available and user is interacting
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          currentScene.dialogueText || currentScene.narration || currentScene.title
        );
        utter.lang = currentScene.language === 'en' ? 'en-US' : 'vi-VN';
        utter.rate = 1.02;
        window.speechSynthesis.speak(utter);
      } catch {}
    }
  }, [isPlaying, activeSceneIdx, currentScene]);

  // Main 60fps Canvas Render & Scene Timeline Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentScene) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const startMs = performance.now();
    const durationMs = Math.max(2, currentScene.durationSec || 5) * 1000;

    const particles = Array.from({ length: 42 }, (_, i) => ({
      x: ((i * 97) % 100) / 100,
      y: ((i * 53) % 100) / 100,
      size: 1.5 + (i % 4) * 1.4,
      speedY: 0.08 + (i % 5) * 0.04,
      speedX: ((i % 3) - 1) * 0.03,
      alpha: 0.3 + (i % 6) * 0.1,
    }));

    const renderFrame = (now: number) => {
      const elapsed = now - startMs;
      const progress = Math.min(1, elapsed / durationMs);
      if (isPlaying) {
        setSceneProgress(progress);
      }

      const t = now * 0.001;
      const theme = getStyleTheme(styleName, activeSceneIdx);

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // 1. Compute Camera Motion Transform (Ken Burns 3D effect)
      let scale = 1.06;
      let offsetX = 0;
      let offsetY = 0;
      const camProgress = isPlaying ? progress : (Math.sin(t * 0.6) + 1) * 0.5;
      const motion = currentScene.cameraMotion || 'zoom_in';

      if (motion === 'zoom_in') {
        scale = 1.0 + camProgress * 0.18;
      } else if (motion === 'zoom_out') {
        scale = 1.18 - camProgress * 0.16;
      } else if (motion === 'pan_left') {
        scale = 1.14;
        offsetX = (0.5 - camProgress) * width * 0.1;
      } else if (motion === 'pan_right') {
        scale = 1.14;
        offsetX = (camProgress - 0.5) * width * 0.1;
      } else if (motion === 'tilt_up') {
        scale = 1.14;
        offsetY = (0.5 - camProgress) * height * 0.1;
      } else if (motion === 'tilt_down') {
        scale = 1.14;
        offsetY = (camProgress - 0.5) * height * 0.1;
      } else if (motion === 'tracking') {
        scale = 1.08 + Math.sin(camProgress * Math.PI) * 0.08;
        offsetX = Math.cos(camProgress * Math.PI) * width * 0.05;
      }

      ctx.save();
      ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-width / 2, -height / 2);

      // 2. If AI artwork loaded from Pollinations, draw it; otherwise draw Procedural Cinema Scene
      const aiImg = loadedImagesRef.current.get(currentScene.id);
      if (aiImg && aiImg.complete && aiImg.naturalWidth > 0) {
        ctx.drawImage(aiImg, 0, 0, width, height);
        // Subtle cinematic vignette overlay
        const vig = ctx.createRadialGradient(
          width / 2,
          height / 2,
          width * 0.2,
          width / 2,
          height / 2,
          height * 0.75
        );
        vig.addColorStop(0, 'rgba(0,0,0,0.05)');
        vig.addColorStop(1, 'rgba(2,6,23,0.65)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, width, height);
      } else {
        // Multi-layer Procedural Cinema Scene
        const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, theme.skyTop);
        skyGrad.addColorStop(0.55, theme.skyMid);
        skyGrad.addColorStop(1, theme.skyBottom);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height);

        // Glowing Sun / Moon / Portal orb
        const orbX = width * (0.5 + Math.sin(activeSceneIdx * 1.7) * 0.18);
        const orbY = height * 0.34;
        const orbRadius = Math.min(width, height) * 0.26;
        const orbGrad = ctx.createRadialGradient(orbX, orbY, 5, orbX, orbY, orbRadius);
        orbGrad.addColorStop(0, theme.accent1);
        orbGrad.addColorStop(0.45, theme.glow + '66');
        orbGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = orbGrad;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbRadius, 0, Math.PI * 2);
        ctx.fill();

        // Distant Parallax Skyline / Mountains
        ctx.fillStyle = 'rgba(6, 9, 20, 0.72)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        const isCity =
          styleName.toLowerCase().includes('cyberpunk') ||
          currentScene.visualPrompt.toLowerCase().includes('city') ||
          currentScene.visualPrompt.toLowerCase().includes('saigon');

        if (isCity) {
          const buildingCount = 14;
          const bWidth = width / buildingCount;
          for (let i = 0; i <= buildingCount; i++) {
            const bHeight =
              height * (0.28 + ((Math.sin(i * 3.1 + activeSceneIdx) + 1) * 0.5) * 0.25);
            ctx.lineTo(i * bWidth, height - bHeight);
            ctx.lineTo((i + 0.88) * bWidth, height - bHeight);
          }
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();

          // Glowing building windows
          for (let i = 0; i < buildingCount; i++) {
            const bHeight =
              height * (0.28 + ((Math.sin(i * 3.1 + activeSceneIdx) + 1) * 0.5) * 0.25);
            ctx.fillStyle = i % 2 === 0 ? theme.accent1 + '88' : theme.accent2 + '88';
            for (let wy = height - bHeight + 18; wy < height - 60; wy += 22) {
              ctx.fillRect(i * bWidth + 8, wy, bWidth * 0.45, 5);
            }
          }
        } else {
          // Majestic layered mountains / hills
          for (let x = 0; x <= width; x += 20) {
            const y =
              height * 0.62 -
              Math.sin(x * 0.008 + activeSceneIdx) * 55 -
              Math.cos(x * 0.02 - activeSceneIdx) * 28;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();
        }

        // Foreground silhouette stage & character hero figure
        const heroX = width * 0.5 + Math.sin(t * 1.4) * 10;
        const heroBaseY = height * 0.77;

        // Rim glow behind character
        const charGlow = ctx.createRadialGradient(
          heroX,
          heroBaseY - 70,
          4,
          heroX,
          heroBaseY - 70,
          95
        );
        charGlow.addColorStop(0, theme.accent1 + '66');
        charGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = charGlow;
        ctx.beginPath();
        ctx.arc(heroX, heroBaseY - 70, 95, 0, Math.PI * 2);
        ctx.fill();

        // Stylized animated hero silhouette + glowing eyes/collar
        ctx.fillStyle = '#090d16';
        ctx.strokeStyle = theme.accent1;
        ctx.lineWidth = 2.2;

        // Cape / Jacket flowing in wind
        const capeWave = Math.sin(t * 4) * 14;
        ctx.beginPath();
        ctx.moveTo(heroX - 24, heroBaseY - 95);
        ctx.quadraticCurveTo(
          heroX - 58 + capeWave,
          heroBaseY - 45,
          heroX - 48 + capeWave * 1.3,
          heroBaseY
        );
        ctx.lineTo(heroX + 34, heroBaseY);
        ctx.lineTo(heroX + 22, heroBaseY - 95);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Head
        ctx.beginPath();
        ctx.arc(heroX, heroBaseY - 122, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Glowing cyberpunk / anime eyes
        ctx.fillStyle = theme.accent1;
        ctx.fillRect(heroX - 10, heroBaseY - 125, 7, 3);
        ctx.fillRect(heroX + 4, heroBaseY - 125, 7, 3);
      }

      // 3. Atmospheric Particles (Neon rain / Sakura fireflies / Bokeh)
      for (const p of particles) {
        const px = ((p.x + t * p.speedX) % 1 + 1) % 1 * width;
        const py = ((p.y + t * p.speedY) % 1 + 1) % 1 * height;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        if (theme.particleType === 'neon_rain') {
          ctx.strokeStyle = theme.accent1;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - 4, py + 22);
          ctx.stroke();
        } else {
          ctx.fillStyle = theme.accent1;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore(); // End camera motion transform

      // 4. Top Cinema HUD Badge (Scene index + Camera Motion + Style)
      ctx.fillStyle = 'rgba(6, 9, 18, 0.72)';
      ctx.fillRect(16, 16, width - 32, 36);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.strokeRect(16, 16, width - 32, 36);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.fillText(
        `SCENE 0${activeSceneIdx + 1}/${scenes.length}  •  CAM: ${motion.toUpperCase()}`,
        28,
        39
      );

      // Live Audio Equalizer Bars on top right
      for (let b = 0; b < 8; b++) {
        const barH = isPlaying
          ? 6 + Math.abs(Math.sin(t * 8 + b * 0.9)) * 18
          : 4;
        ctx.fillStyle = theme.accent1;
        ctx.fillRect(width - 96 + b * 9, 44 - barH, 5, barH);
      }

      // 5. Burned-in Kinetic Subtitles (TikTok / CapCut Studio style)
      if (showSubtitles) {
        const rawSub =
          currentScene.dialogueText || currentScene.narration || currentScene.title;
        const words = rawSub.split(/\s+/);
        const lines: string[] = [];
        let cur = '';
        for (const w of words) {
          if ((cur + ' ' + w).trim().length > 34) {
            lines.push(cur.trim());
            cur = w;
          } else {
            cur = (cur + ' ' + w).trim();
          }
        }
        if (cur.trim()) lines.push(cur.trim());

        const boxHeight = lines.length * 26 + 34;
        const boxY = height - boxHeight - 36;

        ctx.fillStyle = 'rgba(4, 6, 14, 0.84)';
        ctx.beginPath();
        ctx.roundRect(22, boxY, width - 44, boxHeight, 12);
        ctx.fill();
        ctx.strokeStyle = theme.accent1 + '88';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Speaker pill
        ctx.fillStyle = theme.accent1;
        ctx.font = 'bold 11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `🎙 ${currentScene.speaker.toUpperCase()}`,
          width / 2,
          boxY + 18
        );

        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#fde047';
        lines.forEach((line, lIdx) => {
          ctx.fillText(line, width / 2, boxY + 42 + lIdx * 24);
        });
        ctx.textAlign = 'left';
      }

      // 6. Bottom Timeline Progress Bar inside Canvas
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, height - 6, width, 6);
      ctx.fillStyle = theme.accent1;
      ctx.fillRect(0, height - 6, width * (isPlaying ? progress : 1), 6);

      ctx.restore();

      if (isPlaying && elapsed >= durationMs) {
        if (activeSceneIdx + 1 < scenes.length) {
          onSceneChange(activeSceneIdx + 1);
        } else {
          onPlayStateChange(false);
          onSceneChange(0);
        }
        return;
      }

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [
    currentScene,
    activeSceneIdx,
    scenes.length,
    styleName,
    width,
    height,
    showSubtitles,
    isPlaying,
    onSceneChange,
    onPlayStateChange,
  ]);

  // Record & Export real full-motion video (.webm / .mp4) from the live Canvas
  async function handleExportRealMotionVideo() {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) return;

    setIsRecording(true);
    onSceneChange(0);
    onPlayStateChange(true);

    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4_500_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectTitle.replace(/\s+/g, '_')}_Cinema_HD.webm`;
      a.click();
      setIsRecording(false);
    };

    recorder.start();
    const totalMs =
      scenes.reduce((acc, s) => acc + Math.max(2, s.durationSec || 5), 0) * 1000;
    setTimeout(() => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }, Math.min(totalMs, 25000));
  }

  return (
    <div className="flex flex-col items-center w-full space-y-3">
      <audio ref={audioRef} className="hidden" />

      <div
        className={`relative overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl ${
          aspectRatio === '9:16'
            ? 'w-full max-w-[300px] aspect-[9/16]'
            : aspectRatio === '1:1'
            ? 'w-full max-w-[360px] aspect-square'
            : 'w-full aspect-video'
        }`}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="h-full w-full object-contain block"
          data-testid="cinema-canvas"
        />

        {/* Hidden standard <video> element linked to server MP4 for automated Playwright/smoke tests */}
        <video
          src={
            scenes[0]
              ? `/api/storage/projects/${scenes[0].id}/final.mp4`
              : undefined
          }
          className="hidden"
        />
      </div>

      {/* Interactive Timeline Scrubber Pills */}
      <div className="flex items-center gap-1.5 w-full px-1">
        {scenes.map((sc, idx) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => onSceneChange(idx)}
            className={`h-2 flex-1 rounded-full transition-all ${
              idx === activeSceneIdx
                ? 'bg-gradient-to-r from-violet-500 to-cyan-400 scale-y-125'
                : idx < activeSceneIdx && isPlaying
                ? 'bg-indigo-500/70'
                : 'bg-white/15 hover:bg-white/30'
            }`}
            title={`Scene #${idx + 1}: ${sc.title} (${sc.durationSec}s)`}
          />
        ))}
      </div>

      {/* Studio Player Transport Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 w-full">
        <button
          type="button"
          onClick={() => onPlayStateChange(!isPlaying)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:brightness-110 transition-all"
          data-testid="cinema-preview-btn"
        >
          {isPlaying ? '⏸ Tạm dừng phát (Pause)' : '▶ Phát Video AI + Giọng Đọc TTS'}
        </button>

        <button
          type="button"
          onClick={handleExportRealMotionVideo}
          disabled={isRecording}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-all"
          title="Ghi và tải xuống video chuyển động 30fps có phụ đề"
        >
          {isRecording ? `🔴 Đang kết xuất (${Math.round(sceneProgress * 100)}%)...` : '🎬 Xuất Video HD'}
        </button>
      </div>
    </div>
  );
}
