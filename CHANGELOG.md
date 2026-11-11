# Changelog — AI Video Studio

All notable work completed across the 7 incremental implementation phases.

## [Phase 1] — Project Scaffold, Docker Compose, Prisma Schema, Auth, Dashboard
- Created project structure in `C:\Users\admin\.gemini\antigravity\scratch\ai-video-studio`.
- Configured `Dockerfile`, `docker-compose.yml` (`app`, `worker`, `redis`), `.env.example`, and `tsconfig.json`.
- Defined full Prisma schema (`prisma/schema.prisma`) with `User`, `Project`, `Scene`, `Character`, `Job`, and `Asset` models backed by SQLite.
- Implemented HMAC-SHA256 session authentication, `scrypt` password hashing, hourly storyboard rate-limiting, and daily scene generation quotas in `lib/auth.ts`.

## [Phase 2] — Provider Interfaces, Mock Providers & Storyboard Generation with Zod
- Created provider interfaces (`LLMProvider`, `VideoProvider`, `TTSProvider`, `MusicProvider`) in `server/providers/types.ts`.
- Implemented `MockLLMProvider`, `MockVideoProvider`, `MockTTSProvider`, and `MockMusicProvider` in `server/providers/mock.ts` with deterministic MP4 and WAV synthesis (`server/ffmpeg/sample-media.ts`).
- Built `generateValidatedStoryboard` in `server/pipeline/storyboard.ts` with strict Zod validation (`lib/validators.ts`), automatic 1x retry feeding validation errors back to the LLM, ±10% duration reconciliation, and character consistency prompt injection.

## [Phase 3] — Asynchronous Job Queue, Worker & Scene Video/TTS Pipeline
- Built database-backed job queue (`server/jobs/queue.ts`) with deduplication for `storyboard`, `scene_video`, `scene_tts`, and `assemble` jobs.
- Implemented idempotent worker loop (`server/jobs/worker.ts`) respecting configurable concurrency (`WORKER_CONCURRENCY=3`) and storing `providerJobId` prior to polling so worker restarts never duplicate submissions.
- Added `StorageAdapter` abstraction and `LocalStorageAdapter` (`server/storage/adapter.ts`) with path traversal protection.

## [Phase 4] — FFmpeg Assembly, Subtitle Generation & MP4 Streaming
- Built `server/ffmpeg/assembler.ts` with pure command builders (`buildNormalizeSceneFfmpegArgs`, `buildAssembleFinalFfmpegArgs`), normalizing clips to target resolution (`1080x1920` @ 30fps for `9:16`), mixing TTS voiceover, ducking background music by `-12 dB`, generating `.srt` and `.ass` subtitles, and outputting H.264 + AAC + `yuv420p` + `+faststart` MP4.
- Added HTTP Range streaming (`206 Partial Content`) and download endpoints for `/api/storage/*`.
- Added 7-day temporary file cleanup script (`scripts/cleanup.ts`).

## [Phase 5] — Storyboard Editor, Progress UI, Result Page & Scene Regeneration
- Built the 6 responsive frontend screens in `components/StudioApp.tsx`:
  1. Auth Page (Login, Register, 1-click Demo Login)
  2. Project Dashboard with status badges & metadata cards
  3. 3-Step New Project Wizard (Idea/Script + Style chips -> Characters + 5MB Image Upload -> Aspect Ratio + Duration)
  4. Storyboard Editor (inline editing of title, narration, dialogue, English visualPrompt, cameraMotion, duration slider, add/delete/reorder scenes, cost & duration calculator)
  5. Live Generation Progress Screen (polling every 1.5s, per-scene progress bars, retry button on failure)
  6. Result Page (9:16 video player, subtitle overlay toggle, MP4 download, and single-scene regeneration without redoing the whole project)

## [Phase 6] — Real Provider Adapters, Retries & Error Normalization
- Implemented `OpenAICompatibleLLMProvider` and `AnthropicLLMProvider` in `server/providers/llm.ts`.
- Implemented `GeminiVeoVideoProvider` (Google Veo 2 long-running operation API) in `server/providers/video.ts`.
- Implemented `ElevenLabsTTSProvider` (`eleven_multilingual_v2` with Vietnamese `vi` & English `en` support) and `OpenAITTSProvider` in `server/providers/tts.ts`.
- Implemented `normalizeProviderError` and `withRetryAndTimeout` (exponential backoff max 3, timeout, 429 rate-limit handling) in `server/providers/errors.ts`.

## [Phase 7] — Unit Tests, E2E Smoke Tests, i18n (VI/EN) & Documentation
- Added Vietnamese (default) and English localization in `lib/i18n.ts` with instant navbar switcher.
- Wrote 10 unit tests in `tests/unit/pipeline.test.ts` covering Storyboard Zod validation + retry feedback, duration reconciliation, provider error normalization + backoff, and FFmpeg command builders.
- Wrote Playwright browser E2E test (`tests/e2e/smoke.spec.ts`) and full-stack E2E smoke verifier (`tests/e2e/run-smoke.ts`).
- Documented architecture, setup, provider extension guide, and env vars in `README.md`.

