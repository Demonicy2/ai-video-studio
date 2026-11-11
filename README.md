# 🎬 AI Video Studio — Web App Tạo Video AI Từ Kịch Bản / Prompt

Ứng dụng web full-stack tạo video ngắn AI chuyên nghiệp (TikTok, YouTube Shorts, Facebook Reels) từ ý tưởng hoặc kịch bản chi tiết.

---

## 📖 Hướng Dẫn Sử Dụng Chi Tiết (Từ A → Z)

### Bước 1: Khởi động ứng dụng (1-Click trên Windows)
Mở Terminal (PowerShell / Command Prompt) tại thư mục dự án và chạy:

```powershell
.\start-studio.cmd
```
*(Hoặc nhấp đúp trực tiếp vào file **`start-studio.cmd`** trong thư mục dự án).*

Sau khi thấy thông báo `AI Video Studio server listening` tại `http://localhost:3000`, hãy mở trình duyệt và truy cập:
👉 **`http://localhost:3000`**

### Bước 2: Đăng nhập nhanh
- Tại màn hình đăng nhập, bấm nút **"⚡ Dùng ngay tài khoản Demo (1-Click)"** (hoặc đăng nhập với email `demo@aivideostudio.local` / mật khẩu `password123`, hoặc đăng ký tài khoản mới).
- Bấm nút **`VI` / `EN`** trên thanh công cụ để chuyển đổi ngôn ngữ Tiếng Việt / Tiếng Anh bất kỳ lúc nào.

### Bước 3: Tạo dự án mới qua Wizard 3 bước
1. Bấm nút **"+ Tạo dự án mới"** trên thanh điều hướng.
2. **Bước 1 — Ý tưởng & Phong cách**:
   - Bấm vào 1 trong 3 nút **"Mẫu kịch bản gợi ý (1-Click điền nhanh)"** (ví dụ: *"🐱 Mèo máy Sài Gòn 2099"*, *"⛰️ Sơn Tinh Thủy Tinh"*, *"🚀 3 Bí Quyết Học Tập Với AI"*) hoặc tự nhập ý tưởng/kịch bản của bạn.
   - Chọn ngôn ngữ lồng tiếng (`Tiếng Việt (VI)`, `English (EN)`, hoặc `Song ngữ (Mixed)`) và chọn phong cách hình ảnh (`anime fairy tale`, `realistic cinematic`, `3D cartoon`, `cyberpunk neon`, `watercolor storybook`).
   - Bấm **Tiếp tục →**.
3. **Bước 2 — Nhân vật đồng nhất**:
   - Nhập tên và mô tả ngoại hình chi tiết của nhân vật (hệ thống sẽ tự động tiêm mô tả này vào mọi cảnh để giữ đồng nhất nhân vật).
   - Có thể tải lên ảnh tham chiếu (`PNG`, `JPEG`, `WEBP`, tối đa 5 MB). Bấm **Tiếp tục →**.
4. **Bước 3 — Định dạng & Thời lượng**:
   - Chọn tỷ lệ khung hình: `9:16` (TikTok/Shorts), `16:9` (YouTube), hoặc `1:1` (Vuông).
   - Kéo thanh trượt thời lượng mục tiêu (mặc định `15s`) rồi bấm **"✨ Tạo kịch bản phân cảnh (Storyboard)"**.

### Bước 4: Chỉnh sửa Kịch bản Phân cảnh (Storyboard Editor)
- Sau khi AI sinh xong các phân cảnh, bạn có thể:
  - Chỉnh sửa trực tiếp **Tiêu đề cảnh**, **Lời thoại (TTS)**, **Visual Prompt (Tiếng Anh)**, **Chuyển động máy quay (`cameraMotion`)**, và kéo thanh trượt **Thời lượng (`durationSec`)**.
  - **Kéo-thả (Drag & Drop)** thẻ phân cảnh hoặc dùng nút `↑ Lên` / `↓ Xuống` để sắp xếp lại thứ tự.
  - Bấm `+ Thêm phân cảnh`, `Xóa cảnh`, hoặc `↻ Tạo lại Storyboard`.
  - Xem trực tiếp **Tổng thời lượng** và **Chi phí ước tính ($)** trên thanh tiêu đề dự án.
- Khi đã ưng ý, bấm nút **"🚀 Duyệt & Tạo Video AI"**.

### Bước 5: Theo dõi tiến độ, Xem kết quả & Tạo lại từng cảnh
- Màn hình tiến độ tự động cập nhật trực tiếp trạng thái từng cảnh (`Video: ✓ | TTS: ✓`).
- Khi hoàn tất, tại màn hình **Video Hoàn Chỉnh Sẵn Sàng!**:
  - Bấm **"▶ Phát Trình Chiếu Đa Cảnh + Giọng Đọc TTS"** để xem trình chiếu chuyển cảnh kèm âm thanh giọng đọc và phụ đề vàng đồng bộ theo thời gian thực.
  - Bấm **"⬇ Tải xuống MP4"** để tải file video `.mp4` hoặc **"📝 Tải phụ đề (.SRT)"** để tải file phụ đề.
  - Bấm **"🔊 Nghe TTS"** ở từng thẻ cảnh để nghe riêng giọng đọc của cảnh đó.
  - Bấm **"↻ Tạo lại cảnh này"** nếu muốn render lại đúng 1 cảnh bất kỳ và tự động ghép lại video MP4 mà không phải chạy lại toàn bộ dự án.

---

## 🏗️ 1. Kiến Trúc Hệ Thống (Architecture Diagram)

```text
+-----------------------------------------------------------------------------------+
|                        FRONTEND (React / Next.js App Router)                      |
|  [Auth] -> [Dashboard] -> [3-Step Wizard] -> [Storyboard Editor] -> [MP4 Result]  |
|                            (VI / EN i18n, Mobile Responsive)                      |
+-----------------------------------------+-----------------------------------------+
                                          | REST API (/api/*) + Range Streaming
                                          v
+-----------------------------------------------------------------------------------+
|                        BACKEND API LAYER (server/api-router.ts)                   |
|  - Auth & Session Signing (HMAC-SHA256 + scrypt)                                  |
|  - Ownership Guard on every query (project.userId === user.id)                    |
|  - Rate Limiter (5 storyboards/hr) & Daily Scene Quota (User.dailyQuotaUsed)      |
|  - Zod Input Validation & Image Upload Sanitizer (PNG/JPEG/WEBP <= 5MB)           |
+-----------------------------------------+-----------------------------------------+
                                          | Enqueues Async Jobs
                                          v
+-----------------------------------------------------------------------------------+
|                  DATABASE & JOB QUEUE (SQLite via Prisma / Redis)                 |
|  Tables: User | Project | Scene | Character | Job | Asset                         |
+-----------------------------------------+-----------------------------------------+
                                          | Polled by Worker (Concurrency = 3)
                                          v
+-----------------------------------------------------------------------------------+
|                        BACKGROUND WORKER (server/jobs/worker.ts)                  |
|                                                                                   |
|  1. [storyboard]  --> LLMProvider (Mock | OpenAI | Anthropic)                     |
|                       + Zod Schema Validation + 1x Auto-Retry with Error Feedback |
|                       + ±10% Duration Reconciliation + Character Prompt Injection |
|                                                                                   |
|  2. [scene_video] --> VideoProvider (Mock | Google Veo 2 via Gemini API)          |
|                       + Idempotent providerJobId persistence before polling       |
|                                                                                   |
|  3. [scene_tts]   --> TTSProvider (Mock | ElevenLabs Multilingual v2 | OpenAI)    |
|                       + Vietnamese ('vi') & English ('en') synthesis              |
|                                                                                   |
|  4. [assemble]    --> FFmpeg Pipeline (server/ffmpeg/assembler.ts)                |
|                       + Normalize clips (1080x1920 @ 30fps, H.264, yuv420p)       |
|                       + Mix TTS voiceover + Background Music (-12 dB ducking)     |
|                       + Generate SRT -> ASS Subtitles & Burn-in (+faststart)      |
+-----------------------------------------------------------------------------------+
```

---

## ⚙️ 2. Cài Đặt & Chạy Bằng Docker Hoặc Node.js

### Cách 1: Chạy trực tiếp trên máy (Local Development)

```bash
# 1. Sao chép file cấu hình môi trường
cp .env.example .env

# 2. Chạy trên Windows bằng bộ khởi chạy tích hợp:
.\start-studio.cmd

# Hoặc nếu máy đã cài sẵn Node.js toàn cục:
npm install
npm run dev
npm run worker
```

### Cách 2: Chạy bằng Docker Compose

```bash
cp .env.example .env
docker compose up --build
```
Khởi chạy 3 container: `app` (cổng `3000`), `worker` (xử lý job ngầm + cài sẵn `ffmpeg`), và `redis` (cổng `6379`).

---

## 🧪 3. Chạy Kiểm Thử (Unit Tests & E2E Tests)

```powershell
# Chạy 10 Unit Tests (Zod Storyboard, Duration reconciliation, Provider errors, FFmpeg args)
.\bin\node.cmd tests/unit/pipeline.test.ts

# Chạy End-to-End Smoke Test (Đăng nhập -> Tạo dự án -> Storyboard -> Video/TTS -> Ghép MP4 -> Tạo lại 1 cảnh)
.\bin\node.cmd tests/e2e/run-smoke.ts

# Chạy Playwright Browser Test
npx playwright test
```

---

## 🔑 4. Bảng Biến Môi Trường (`.env`)

| Biến môi trường | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `DATABASE_URL` | `file:./dev.db` | Chuỗi kết nối SQLite (hoặc PostgreSQL) |
| `AUTH_SECRET` | `dev-super-secret...` | Khóa bí mật ký cookie phiên đăng nhập HMAC-SHA256 |
| `STORAGE_DRIVER` | `local` | Bộ lưu trữ file (`local` lưu vào `./storage`) |
| `STORAGE_LOCAL_PATH` | `./storage` | Thư mục lưu video clip, audio TTS, ảnh và file MP4 cuối |
| `WORKER_CONCURRENCY` | `3` | Số job xử lý song song tối đa |
| `DAILY_SCENE_QUOTA` | `30` | Hạn mức số cảnh tối đa mỗi người dùng được tạo trong ngày |
| `STORYBOARD_HOURLY_LIMIT` | `5` | Số lần tạo Storyboard tối đa mỗi giờ cho mỗi người dùng |
| `ESTIMATED_COST_PER_SECOND_USD` | `0.05` | Đơn giá ước tính mỗi giây hiển thị trên Storyboard Editor |
| `LLM_PROVIDER` | `mock` | `mock` \| `openai` \| `anthropic` |
| `OPENAI_API_KEY` | `""` | API key cho OpenAI LLM và/hoặc OpenAI TTS |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Endpoint URL tương thích chuẩn OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model OpenAI dùng để tạo Storyboard |
| `ANTHROPIC_API_KEY` | `""` | API key cho Anthropic Claude |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-latest` | Model Claude dùng để tạo Storyboard |
| `VIDEO_PROVIDER` | `mock` | `mock` \| `veo` (Google Veo 2 qua Gemini API) |
| `GEMINI_API_KEY` | `""` | Google Gemini API key dùng cho Veo |
| `VEO_MODEL` | `veo-2.0-generate-001` | Tên model Google Veo |
| `TTS_PROVIDER` | `mock` | `mock` \| `elevenlabs` \| `openai` |
| `ELEVENLABS_API_KEY` | `""` | API key ElevenLabs (`eleven_multilingual_v2` hỗ trợ Tiếng Việt & Tiếng Anh) |
| `ELEVENLABS_VOICE_ID_VI` | `21m00Tcm4TlvDq8ikWAM` | Voice ID ElevenLabs cho giọng đọc Tiếng Việt |
| `ELEVENLABS_VOICE_ID_EN` | `21m00Tcm4TlvDq8ikWAM` | Voice ID ElevenLabs cho giọng đọc Tiếng Anh |

---

## 🔌 5. Cách Thêm Nhà Cung Cấp Video Mới (Step-by-Step)

1. **Tạo class Adapter** thực thi interface `VideoProvider` trong `server/providers/video.ts`:
   ```ts
   export class RunwayVideoProvider implements VideoProvider {
     public readonly name = 'runway-gen3';

     async submitVideoJob(scene: SubmitVideoJobInput): Promise<string> {
       return await withRetryAndTimeout(async (signal) => {
         // Gọi POST API của nhà cung cấp và trả về externalJobId
       }, { providerName: this.name, maxRetries: 3, timeoutMs: 30000 });
     }

     async getVideoJobStatus(externalJobId: string): Promise<VideoJobStatusResult> {
       return await withRetryAndTimeout(async (signal) => {
         // Poll GET API và trả về { status: 'queued' | 'running' | 'done' | 'failed', videoUrl }
       }, { providerName: this.name, maxRetries: 3, timeoutMs: 30000 });
     }
   }
   ```
2. **Đăng ký vào Factory** trong `server/providers/index.ts`:
   ```ts
   if (kind === 'runway' && process.env.RUNWAY_API_KEY) {
     return new RunwayVideoProvider();
   }
   ```
3. **Bổ sung biến môi trường** vào `.env.example` (`VIDEO_PROVIDER="runway"`, `RUNWAY_API_KEY=""`).

---

## ⚠️ 6. Giới Hạn Hiện Tại (Known Limitations)

- Mặc định khi chưa điền API key vào `.env`, hệ thống chạy ở chế độ `mock` (tạo container MP4 H.264 mẫu và âm thanh WAV tổng hợp) để bạn kiểm thử toàn bộ quy trình miễn phí.
- Nếu máy Windows chưa cài `ffmpeg` vào biến môi trường `PATH`, hệ thống tự động dùng bộ đóng gói MP4 nội bộ. Để ghép nối hình ảnh H.264 và đốt phụ đề ASS trực tiếp vào khung hình video thật, hãy cài đặt `ffmpeg` hoặc chạy qua `docker compose up`.
