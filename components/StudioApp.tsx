'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Film,
  Settings,
  Cpu,
  Layers,
  Volume2,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  Video,
  Subtitles,
  ArrowUp,
  ArrowDown,
  LogOut,
  FolderKanban,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  Progress,
  Skeleton,
  Textarea,
} from './ui/primitives.tsx';
import { CinemaCanvasPlayer, type CinemaSceneSpec } from './CinemaCanvasPlayer.tsx';
import { t, type Locale } from '../lib/i18n.ts';

interface DialogueItem {
  speaker: string;
  text: string;
  language: 'vi' | 'en';
}

interface SceneItem {
  id: string;
  projectId: string;
  index: number;
  title: string;
  narration: string;
  dialogue: string;
  visualPrompt: string;
  negativePrompt: string;
  cameraMotion: string;
  durationSec: number;
  status: 'pending' | 'submitted' | 'running' | 'done' | 'failed';
  videoPath?: string | null;
  audioPath?: string | null;
  lastError?: string | null;
}

interface CharacterItem {
  id?: string;
  name: string;
  description: string;
  referenceImagePath?: string | null;
}

interface JobLogItem {
  id: string;
  type: string;
  status: string;
  attempts: number;
  lastError?: string | null;
  updatedAt: string;
}

interface ProjectItem {
  id: string;
  title: string;
  sourceType: 'idea' | 'script';
  sourceText: string;
  language: 'vi' | 'en' | 'mixed';
  aspectRatio: '9:16' | '16:9' | '1:1';
  targetDurationSec: number;
  style: string;
  status: 'draft' | 'storyboard_ready' | 'generating' | 'assembling' | 'done' | 'failed';
  finalVideoPath?: string | null;
  subtitlePath?: string | null;
  lastError?: string | null;
  createdAt: string;
  scenes: SceneItem[];
  characters: CharacterItem[];
  jobs?: JobLogItem[];
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  dailyQuotaUsed?: number;
  dailyQuotaLimit?: number;
}

interface ProviderSettingsState {
  llmProvider: string;
  videoProvider: string;
  ttsProvider: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  geminiModel: string;
  veoModel: string;
  openaiModel: string;
  anthropicModel: string;
  hasGeminiKey: boolean;
  hasOpenaiKey: boolean;
  hasAnthropicKey: boolean;
  hasElevenlabsKey: boolean;
}

const STYLE_PRESETS = [
  {
    id: 'cyberpunk neon',
    title: 'Cyberpunk 2099',
    desc: 'Neon rain, hologram reflections & anamorphic lens flare',
    gradient: 'from-fuchsia-600 via-violet-700 to-cyan-500',
  },
  {
    id: 'anime fairy tale',
    title: 'Anime Makoto Shinkai',
    desc: 'Volumetric sky clouds, golden twilight & sakura particles',
    gradient: 'from-indigo-600 via-purple-600 to-pink-500',
  },
  {
    id: 'realistic cinematic',
    title: 'Cinema IMAX 8K',
    desc: 'ARRI Alexa 65 depth, dramatic chiaroscuro & film grain',
    gradient: 'from-amber-600 via-orange-700 to-slate-800',
  },
  {
    id: '3D cartoon',
    title: '3D Pixar Studio',
    desc: 'Subsurface scattering, vibrant lighting & expressive charm',
    gradient: 'from-sky-500 via-blue-600 to-emerald-500',
  },
  {
    id: 'watercolor storybook',
    title: 'Storybook Art',
    desc: 'Delicate hand-painted watercolor wash & warm ink lines',
    gradient: 'from-rose-500 via-amber-500 to-teal-600',
  },
];

const CAMERA_MOTIONS = [
  'static',
  'zoom_in',
  'zoom_out',
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'tracking',
];

const SAMPLE_TEMPLATES = [
  {
    label: '🐱 Mèo máy Sài Gòn 2099 (Cyberpunk)',
    title: 'Hành trình Mèo Máy Sài Gòn 2099',
    sourceType: 'idea' as const,
    sourceText:
      'Một chú mèo máy thông minh đeo khăn quàng đỏ bay lượn qua những tòa tháp rực sáng ánh đèn neon tại Sài Gòn năm 2099 để trao bức thư bí mật.',
    language: 'vi' as const,
    style: 'cyberpunk neon',
    characters: [
      {
        name: 'Mèo Mun',
        description: 'sleek black robotic cat with glowing cyan eyes and a crimson scarf',
      },
    ],
  },
  {
    label: '⛰️ Truyền thuyết Sơn Tinh Thủy Tinh (Anime)',
    title: 'Sơn Tinh Thủy Tinh — Đại Chiến Mùa Nước Nổi',
    sourceType: 'idea' as const,
    sourceText:
      'Cuộc đối đầu hùng tráng giữa Sơn Tinh nâng núi cao và Thủy Tinh dâng sóng lớn giữa khung cảnh thần thoại Việt Nam tráng lệ.',
    language: 'vi' as const,
    style: 'anime fairy tale',
    characters: [
      {
        name: 'Sơn Tinh',
        description: 'noble mountain deity in bronze and emerald armor wielding earth magic',
      },
    ],
  },
  {
    label: '🚀 3 Bí Quyết Học Tập Với AI (3D Pixar)',
    title: '3 Bí Quyết Tăng Tốc Học Tập Cùng AI',
    sourceType: 'script' as const,
    sourceText:
      'Cảnh 1: Đặt câu hỏi đúng trọng tâm để khai phá kiến thức sâu. Cảnh 2: Tóm tắt kiến thức bằng sơ đồ tư duy trực quan. Cảnh 3: Tự kiểm tra lại bằng bài tập thực hành mỗi ngày.',
    language: 'vi' as const,
    style: '3D cartoon',
    characters: [
      {
        name: 'Minh',
        description: 'friendly 3D Pixar-style student wearing round glasses and a blue hoodie',
      },
    ],
  },
];

export function StudioApp() {
  const [locale, setLocale] = useState<Locale>('vi');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@aivideostudio.local');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('Demo Creator');

  const [view, setView] = useState<'dashboard' | 'wizard' | 'project'>('dashboard');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectItem | null>(null);
  const [costPerSec, setCostPerSec] = useState(0.05);
  const [draggedSceneIdx, setDraggedSceneIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(
    null
  );

  // AI Settings Modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [providerSettings, setProviderSettings] = useState<ProviderSettingsState | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [cfgLlm, setCfgLlm] = useState('smart-local');
  const [cfgVideo, setCfgVideo] = useState('cinema-canvas');
  const [cfgTts, setCfgTts] = useState('neural-free');
  const [cfgGeminiKey, setCfgGeminiKey] = useState('');
  const [cfgOpenaiKey, setCfgOpenaiKey] = useState('');
  const [cfgElevenKey, setCfgElevenKey] = useState('');
  const [cfgOllamaModel, setCfgOllamaModel] = useState('llama3.2');

  // Wizard state (3 steps)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizTitle, setWizTitle] = useState('');
  const [wizSourceType, setWizSourceType] = useState<'idea' | 'script'>('idea');
  const [wizSourceText, setWizSourceText] = useState('');
  const [wizLanguage, setWizLanguage] = useState<'vi' | 'en' | 'mixed'>('vi');
  const [wizStyle, setWizStyle] = useState('cyberpunk neon');
  const [wizCharacters, setWizCharacters] = useState<CharacterItem[]>([
    { name: 'Linh', description: 'young Vietnamese explorer in a glowing cyberpunk jacket' },
  ]);
  const [wizAspectRatio, setWizAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [wizTargetDuration, setWizTargetDuration] = useState(15);
  const [submittingWizard, setSubmittingWizard] = useState(false);
  const [enhancingScript, setEnhancingScript] = useState(false);

  // Result page & Live Multi-Scene Cinema Preview state
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [forceEditorMode, setForceEditorMode] = useState(false);
  const [cinemaPlaying, setCinemaPlaying] = useState(false);
  const [cinemaSceneIdx, setCinemaSceneIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showToast = useCallback((text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
    }
  }, []);

  const fetchProviderSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/providers');
      if (res.ok) {
        const data = await res.json();
        setProviderSettings(data.settings);
        setOllamaModels(data.ollamaModels || []);
        setCfgLlm(data.settings.llmProvider);
        setCfgVideo(data.settings.videoProvider);
        setCfgTts(data.settings.ttsProvider);
        setCfgOllamaModel(data.settings.ollamaModel || 'llama3.2');
      }
    } catch {}
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const fetchActiveProject = useCallback(
    async (projectId: string) => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveProject(data.project);
        if (data.costPerSecondUsd) setCostPerSec(data.costPerSecondUsd);
        refreshUser();
      }
    },
    [refreshUser]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          await Promise.all([fetchProjects(), fetchProviderSettings()]);
        }
      } finally {
        setAuthChecking(false);
      }
    })();
  }, [fetchProjects, fetchProviderSettings]);

  // Live polling every 1.2s when activeProject is in draft, generating, or assembling
  useEffect(() => {
    if (!activeProject || view !== 'project') return;
    const isBusy =
      activeProject.status === 'draft' ||
      activeProject.status === 'generating' ||
      activeProject.status === 'assembling';
    if (!isBusy) return;

    const timer = setInterval(() => {
      fetchActiveProject(activeProject.id);
    }, 1200);

    return () => clearInterval(timer);
  }, [activeProject, view, fetchActiveProject]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Authentication error', 'error');
      return;
    }
    await refreshUser();
    showToast(`Chào mừng đến với AI Video Studio, ${data.user.name}!`, 'success');
    await Promise.all([fetchProjects(), fetchProviderSettings()]);
  }

  async function handleDemoLogin() {
    const res = await fetch('/api/auth/demo', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      await refreshUser();
      showToast(`Đã đăng nhập Studio: ${data.user.email}`, 'success');
      await Promise.all([fetchProjects(), fetchProviderSettings()]);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setActiveProject(null);
    setView('dashboard');
  }

  async function handleSaveProviderSettings() {
    const payload: Record<string, string> = {
      llmProvider: cfgLlm,
      videoProvider: cfgVideo,
      ttsProvider: cfgTts,
      ollamaModel: cfgOllamaModel,
    };
    if (cfgGeminiKey.trim()) payload.geminiApiKey = cfgGeminiKey.trim();
    if (cfgOpenaiKey.trim()) payload.openaiApiKey = cfgOpenaiKey.trim();
    if (cfgElevenKey.trim()) payload.elevenlabsApiKey = cfgElevenKey.trim();

    const res = await fetch('/api/settings/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchProviderSettings();
      setShowSettingsModal(false);
      showToast('Đã lưu cấu hình AI Engine thành công!', 'success');
    }
  }

  async function handleMagicEnhanceIdea() {
    setEnhancingScript(true);
    try {
      const res = await fetch('/api/ai/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wizTitle,
          idea: wizSourceText,
          language: wizLanguage,
          style: wizStyle,
          characterName: wizCharacters[0]?.name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWizTitle(data.enhancedTitle);
        setWizSourceText(data.enhancedScript);
        setWizSourceType('script');
        showToast('✨ AI Director đã mở rộng kịch bản phân cảnh chi tiết!', 'success');
      }
    } finally {
      setEnhancingScript(false);
    }
  }

  async function handleDeleteProject(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Đã xóa dự án', 'info');
      await fetchProjects();
    }
  }

  async function handleCharacterImageUpload(idx: number, file: File) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('Ảnh vượt quá giới hạn 5 MB / Max 5MB exceeded', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || '');
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          base64Data,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Upload failed', 'error');
        return;
      }
      setWizCharacters((prev) =>
        prev.map((c, i) => (i === idx ? { ...c, referenceImagePath: data.path } : c))
      );
      showToast('Đã tải lên ảnh tham chiếu nhân vật', 'success');
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateProjectAndStoryboard() {
    if (!wizTitle.trim() || wizSourceText.trim().length < 5) {
      showToast('Vui lòng nhập tiêu đề và ý tưởng/kịch bản (hoặc bấm nút Mẫu gợi ý)', 'error');
      return;
    }
    setSubmittingWizard(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: wizTitle.trim(),
          sourceType: wizSourceType,
          sourceText: wizSourceText.trim(),
          language: wizLanguage,
          style: wizStyle,
          aspectRatio: wizAspectRatio,
          targetDurationSec: wizTargetDuration,
          characters: wizCharacters.filter((c) => c.name.trim() && c.description.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to create project', 'error');
        return;
      }
      setActiveProject(data.project);
      setForceEditorMode(false);
      setCinemaSceneIdx(0);
      setView('project');
      showToast('✨ AI Director đang phân tích kịch bản và dựng Storyboard...', 'info');
    } finally {
      setSubmittingWizard(false);
    }
  }

  async function handleSceneFieldUpdate(sceneId: string, patch: Record<string, unknown>) {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await fetchActiveProject(activeProject.id);
    } else {
      const d = await res.json();
      showToast(d.error || 'Update failed', 'error');
    }
  }

  async function handleAddScene() {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      await fetchActiveProject(activeProject.id);
      showToast('Đã thêm phân cảnh mới', 'success');
    }
  }

  async function handleDeleteScene(sceneId: string) {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/scenes/${sceneId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await fetchActiveProject(activeProject.id);
      showToast('Đã xóa phân cảnh', 'info');
    }
  }

  async function handleReorderScenes(fromIdx: number, toIdx: number) {
    if (!activeProject || fromIdx === toIdx) return;
    const scenes = [...activeProject.scenes];
    if (toIdx < 0 || toIdx >= scenes.length) return;
    const [moved] = scenes.splice(fromIdx, 1);
    scenes.splice(toIdx, 0, moved);

    const res = await fetch(`/api/projects/${activeProject.id}/scenes/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIds: scenes.map((s) => s.id) }),
    });
    if (res.ok) {
      await fetchActiveProject(activeProject.id);
    }
  }

  async function handleRegenerateStoryboard() {
    if (!activeProject) return;
    const res = await fetch(`/api/projects/${activeProject.id}/storyboard`, {
      method: 'POST',
    });
    if (res.ok) {
      await fetchActiveProject(activeProject.id);
      showToast('Đang tạo lại Storyboard...', 'info');
    } else {
      const d = await res.json();
      showToast(d.error || 'Failed to regenerate storyboard', 'error');
    }
  }

  async function handleApproveAndGenerateVideo() {
    if (!activeProject) return;
    setForceEditorMode(false);
    setCinemaPlaying(false);
    const res = await fetch(`/api/projects/${activeProject.id}/generate`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Cannot start generation', 'error');
      return;
    }
    showToast('🚀 Đang kết xuất Video AI & Giọng đọc Neural TTS cho toàn bộ phân cảnh!', 'success');
    await fetchActiveProject(activeProject.id);
  }

  async function handleRegenerateSingleScene(sceneId: string) {
    if (!activeProject) return;
    setForceEditorMode(false);
    setCinemaPlaying(false);
    const res = await fetch(
      `/api/projects/${activeProject.id}/scenes/${sceneId}/regenerate`,
      { method: 'POST' }
    );
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Cannot regenerate scene', 'error');
      return;
    }
    showToast('Đang kết xuất lại phân cảnh và ghép lại MP4...', 'info');
    await fetchActiveProject(activeProject.id);
  }

  function playSceneVoicePreview(scene: SceneItem) {
    let dialogueArr: DialogueItem[] = [];
    try {
      dialogueArr = JSON.parse(scene.dialogue || '[]');
    } catch {}
    const text = dialogueArr[0]?.text || scene.narration || scene.title;
    const lang = dialogueArr[0]?.language || (activeProject?.language === 'en' ? 'en' : 'vi');

    if (scene.audioPath && audioRef.current) {
      audioRef.current.src = `/api/storage/${scene.audioPath}`;
      audioRef.current.play().catch(() => {});
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = lang === 'en' ? 'en-US' : 'vi-VN';
        window.speechSynthesis.speak(utter);
      } catch {}
    }
  }

  function renderStatusBadge(status: ProjectItem['status'] | SceneItem['status']) {
    if (status === 'done') return <Badge variant="success">{t(locale, 'status_done')}</Badge>;
    if (status === 'failed') return <Badge variant="danger">{t(locale, 'status_failed')}</Badge>;
    if (status === 'storyboard_ready')
      return <Badge variant="info">{t(locale, 'status_storyboard_ready')}</Badge>;
    if (status === 'generating' || status === 'running' || status === 'submitted')
      return <Badge variant="warning">{t(locale, 'status_generating')}</Badge>;
    if (status === 'assembling')
      return <Badge variant="warning">{t(locale, 'status_assembling')}</Badge>;
    return <Badge variant="default">{t(locale, 'status_draft')}</Badge>;
  }

  if (authChecking) {
    return (
      <div className="min-h-screen studio-bg text-slate-100 p-8 flex items-center justify-center">
        <Skeleton className="h-72 w-full max-w-md" />
      </div>
    );
  }

  // SCREEN 1: AUTH PAGE (Cinema Studio Glassmorphism)
  if (!user) {
    return (
      <div className="min-h-screen studio-bg text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
        <div className="mb-8 flex items-center gap-3.5 z-10">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-xl shadow-violet-600/30">
            <Film className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-cyan-300 bg-clip-text text-transparent">
                {t(locale, 'appName')}
              </h1>
              <Badge variant="info">PRO STUDIO</Badge>
            </div>
            <p className="text-xs text-slate-400">{t(locale, 'tagline')}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label="Toggle language"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
          >
            {locale.toUpperCase()}
          </Button>
        </div>

        <Card className="w-full max-w-md p-7 space-y-5 z-10" data-testid="auth-card">
          <div className="space-y-1">
            <h2 className="text-xl font-bold">
              {authMode === 'login' ? t(locale, 'loginTitle') : t(locale, 'registerTitle')}
            </h2>
            <p className="text-xs text-slate-400">
              AI Storyboard Director • Multi-Scene Video • Vietnamese & English Neural TTS
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t(locale, 'nameLabel')}
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  aria-label={t(locale, 'nameLabel')}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t(locale, 'emailLabel')}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="auth-email-input"
                aria-label={t(locale, 'emailLabel')}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t(locale, 'passwordLabel')}
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="auth-password-input"
                aria-label={t(locale, 'passwordLabel')}
              />
            </div>

            <Button type="submit" className="w-full py-2.5" data-testid="auth-submit-btn">
              <Sparkles className="h-4 w-4" />
              {authMode === 'login' ? t(locale, 'loginBtn') : t(locale, 'registerBtn')}
            </Button>
          </form>

          <div className="relative py-1 text-center">
            <span className="text-[11px] uppercase tracking-widest text-slate-500">
              TRẢI NGHIỆM NHANH / INSTANT STUDIO ACCESS
            </span>
          </div>

          <Button
            variant="magic"
            className="w-full py-2.5"
            onClick={handleDemoLogin}
            data-testid="demo-login-btn"
          >
            <Wand2 className="h-4 w-4" />
            {t(locale, 'demoLoginBtn')}
          </Button>

          <button
            type="button"
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            className="w-full text-center text-xs text-violet-400 hover:underline"
          >
            {authMode === 'login' ? t(locale, 'switchRegister') : t(locale, 'switchLogin')}
          </button>
        </Card>
      </div>
    );
  }

  const totalSceneDuration =
    activeProject?.scenes.reduce((acc, s) => acc + Number(s.durationSec || 0), 0) || 0;
  const estimatedCost = (totalSceneDuration * costPerSec).toFixed(2);

  const cinemaScenes: CinemaSceneSpec[] = (activeProject?.scenes || []).map((s) => {
    let d: DialogueItem[] = [];
    try {
      d = JSON.parse(s.dialogue || '[]');
    } catch {}
    return {
      id: s.id,
      index: s.index,
      title: s.title,
      narration: s.narration,
      dialogueText: d[0]?.text || s.narration || s.title,
      speaker: d[0]?.speaker || activeProject?.characters?.[0]?.name || 'Narrator',
      language: d[0]?.language || (activeProject?.language === 'en' ? 'en' : 'vi'),
      visualPrompt: s.visualPrompt,
      cameraMotion: s.cameraMotion,
      durationSec: s.durationSec,
      audioPath: s.audioPath,
    };
  });

  return (
    <div className="min-h-screen studio-bg text-slate-100 flex flex-col">
      <audio ref={audioRef} className="hidden" />

      {/* Top Glassmorphic Studio Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070911]/85 backdrop-blur-xl px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setCinemaPlaying(false);
              setView('dashboard');
              fetchProjects();
            }}
            className="flex items-center gap-3 text-left focus:outline-none cursor-pointer"
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">
                  {t(locale, 'appName')}
                </span>
                <span className="rounded-md bg-violet-500/20 border border-violet-500/30 px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                  GEN-3 STUDIO
                </span>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:block">
                LLM: <strong className="text-cyan-300">{providerSettings?.llmProvider || 'smart-local'}</strong> • TTS:{' '}
                <strong className="text-violet-300">{providerSettings?.ttsProvider || 'neural-free'}</strong> •{' '}
                {t(locale, 'quotaBadge')}: {user.dailyQuotaUsed ?? 0}/{user.dailyQuotaLimit ?? 30}
              </span>
            </div>
          </button>
        </div>

        <nav className="flex items-center gap-2">
          <Button
            variant={view === 'dashboard' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setCinemaPlaying(false);
              setView('dashboard');
              fetchProjects();
            }}
            data-testid="nav-dashboard-btn"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t(locale, 'navDashboard')}</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setCinemaPlaying(false);
              setWizardStep(1);
              setWizTitle('');
              setWizSourceText('');
              setView('wizard');
            }}
            data-testid="nav-new-project-btn"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t(locale, 'navNewProject')}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              fetchProviderSettings();
              setShowSettingsModal(true);
            }}
            title="Cấu hình AI Engine & API Keys"
          >
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
            <span className="hidden md:inline">AI Engine</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            aria-label="Switch Language"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
            data-testid="lang-toggle-btn"
          >
            {locale.toUpperCase()}
          </Button>

          <Button variant="ghost" size="sm" onClick={handleLogout} title={t(locale, 'navLogout')}>
            <LogOut className="h-4 w-4" />
          </Button>
        </nav>
      </header>

      {/* AI ENGINE & API KEYS SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-xl p-6 space-y-5 border-violet-500/30">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <Settings className="h-5 w-5 text-violet-400" />
                <h3 className="text-lg font-bold">Cấu hình AI Engine & Cloud API Keys</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowSettingsModal(false)}>
                ✕
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  1. Storyboard LLM
                </label>
                <select
                  value={cfgLlm}
                  onChange={(e) => setCfgLlm(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#070911] px-3 py-2 text-xs text-white"
                >
                  <option value="smart-local">✨ Smart AI Director (Sẵn có)</option>
                  <option value="ollama">🦙 Local Ollama ({ollamaModels.length} models)</option>
                  <option value="gemini">💎 Google Gemini 2.0 Flash</option>
                  <option value="openai">🧠 OpenAI GPT-4o</option>
                  <option value="anthropic">🎭 Anthropic Claude 3.5</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  2. Video Render Engine
                </label>
                <select
                  value={cfgVideo}
                  onChange={(e) => setCfgVideo(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#070911] px-3 py-2 text-xs text-white"
                >
                  <option value="cinema-canvas">🎬 Cinema Canvas 60fps + Flux</option>
                  <option value="veo">🎥 Google Veo 2 (Gemini API)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  3. Giọng đọc TTS (VI/EN)
                </label>
                <select
                  value={cfgTts}
                  onChange={(e) => setCfgTts(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#070911] px-3 py-2 text-xs text-white"
                >
                  <option value="neural-free">🎙 Neural VI/EN Voice (Miễn phí)</option>
                  <option value="elevenlabs">🔊 ElevenLabs Multilingual v2</option>
                  <option value="openai">🗣 OpenAI TTS HD</option>
                </select>
              </div>
            </div>

            {cfgLlm === 'ollama' && (
              <div>
                <label className="block text-xs font-semibold text-cyan-300 mb-1">
                  Model Ollama trên máy của bạn (`http://127.0.0.1:11434`):
                </label>
                <Input
                  value={cfgOllamaModel}
                  onChange={(e) => setCfgOllamaModel(e.target.value)}
                  placeholder="VD: llama3.2, qwen2.5, gemma2..."
                />
                {ollamaModels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ollamaModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCfgOllamaModel(m)}
                        className="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-1 text-xs text-cyan-300"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Google Gemini API Key (Dùng cho cả Gemini Storyboard & Google Veo 2 Video):
                </label>
                <Input
                  type="password"
                  value={cfgGeminiKey}
                  onChange={(e) => setCfgGeminiKey(e.target.value)}
                  placeholder={
                    providerSettings?.hasGeminiKey
                      ? '•••••••••••••••• (Đã lưu key)'
                      : 'AIzaSy... (Lấy miễn phí tại aistudio.google.com)'
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">OpenAI API Key:</label>
                  <Input
                    type="password"
                    value={cfgOpenaiKey}
                    onChange={(e) => setCfgOpenaiKey(e.target.value)}
                    placeholder={providerSettings?.hasOpenaiKey ? '•••••••• (Đã lưu)' : 'sk-...'}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">ElevenLabs API Key:</label>
                  <Input
                    type="password"
                    value={cfgElevenKey}
                    onChange={(e) => setCfgElevenKey(e.target.value)}
                    placeholder={providerSettings?.hasElevenlabsKey ? '•••••••• (Đã lưu)' : 'xi-...'}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowSettingsModal(false)}>
                Đóng
              </Button>
              <Button variant="primary" onClick={handleSaveProviderSettings}>
                <CheckCircle2 className="h-4 w-4" />
                Lưu cấu hình AI
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl border backdrop-blur-xl ${
            toast.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
              : toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-[#0d101b]/95 border-violet-500/40 text-violet-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        {/* SCREEN 2: DASHBOARD */}
        {view === 'dashboard' && (
          <div className="space-y-8" data-testid="dashboard-screen">
            {/* Hero Studio Banner */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-violet-950/70 via-[#0e1224] to-cyan-950/60 p-6 sm:p-8 shadow-2xl">
              <div className="max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Storyboard • 60fps Cinema Canvas • Neural Vietnamese & English TTS
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                  {t(locale, 'dashboardHeading')}
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {t(locale, 'dashboardSub')}
                </p>
                <div className="pt-2 flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    onClick={() => {
                      setWizardStep(1);
                      setWizTitle('');
                      setWizSourceText('');
                      setView('wizard');
                    }}
                    data-testid="dashboard-new-project-btn"
                  >
                    <Wand2 className="h-4 w-4" />
                    {t(locale, 'navNewProject')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setShowSettingsModal(true)}
                  >
                    <Sliders className="h-4 w-4" />
                    Cấu hình AI Engine
                  </Button>
                </div>
              </div>
            </div>

            {loadingProjects ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <Skeleton className="h-56" />
                <Skeleton className="h-56" />
                <Skeleton className="h-56" />
              </div>
            ) : projects.length === 0 ? (
              <Card className="p-12 text-center space-y-4">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-600/25 to-cyan-500/25 border border-violet-500/30 text-violet-300 flex items-center justify-center">
                  <Video className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold">{t(locale, 'emptyProjectsTitle')}</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  {t(locale, 'emptyProjectsDesc')}
                </p>
                <Button
                  onClick={() => {
                    setWizardStep(1);
                    setView('wizard');
                  }}
                  data-testid="empty-create-btn"
                >
                  <Sparkles className="h-4 w-4" />
                  {t(locale, 'createFirstBtn')}
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {projects.map((proj) => {
                  const preset =
                    STYLE_PRESETS.find((s) => s.id === proj.style) || STYLE_PRESETS[0];
                  return (
                    <Card
                      key={proj.id}
                      className="p-5 flex flex-col justify-between hover:border-violet-500/50 transition-all cursor-pointer group"
                      onClick={() => {
                        setActiveProject(proj);
                        setForceEditorMode(false);
                        setCinemaPlaying(false);
                        setCinemaSceneIdx(0);
                        setView('project');
                      }}
                      data-testid={`project-card-${proj.id}`}
                    >
                      <div className="space-y-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-base text-white line-clamp-1">
                            {proj.title}
                          </h3>
                          {renderStatusBadge(proj.status)}
                        </div>

                        <div
                          className={`h-32 rounded-xl bg-gradient-to-br ${preset.gradient} p-4 flex flex-col justify-between relative overflow-hidden shadow-inner`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold text-white/90">
                            <span className="rounded-md bg-black/40 backdrop-blur px-2 py-0.5">
                              {proj.aspectRatio}
                            </span>
                            <span className="rounded-md bg-black/40 backdrop-blur px-2 py-0.5">
                              {proj.targetDurationSec}s
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-white drop-shadow line-clamp-2">
                            {proj.scenes?.[0]?.title || proj.sourceText}
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 line-clamp-2">{proj.sourceText}</p>
                      </div>

                      <div className="pt-4 mt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                        <span className="font-medium">
                          {proj.scenes?.length || 0} scenes • {proj.language.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteProject(e, proj.id)}
                          className="inline-flex items-center gap-1 text-rose-400 hover:underline text-xs cursor-pointer"
                          aria-label={t(locale, 'deleteProjectBtn')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t(locale, 'deleteProjectBtn')}
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SCREEN 3: NEW PROJECT WIZARD (3 STEPS) */}
        {view === 'wizard' && (
          <div className="max-w-3xl mx-auto space-y-6" data-testid="wizard-screen">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-4">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setWizardStep(s as 1 | 2 | 3)}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    wizardStep === s
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg'
                      : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
                  }`}
                >
                  {s === 1
                    ? t(locale, 'wizardStep1')
                    : s === 2
                    ? t(locale, 'wizardStep2')
                    : t(locale, 'wizardStep3')}
                </button>
              ))}
            </div>

            {wizardStep === 1 && (
              <Card className="p-6 sm:p-8 space-y-6" data-testid="wizard-step-1">
                {/* 1-Click Preset Templates */}
                <div className="space-y-2.5">
                  <span className="block text-xs font-bold uppercase tracking-wider text-violet-300">
                    ✨ {t(locale, 'sampleTemplatesLabel')}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_TEMPLATES.map((tpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setWizTitle(tpl.title);
                          setWizSourceType(tpl.sourceType);
                          setWizSourceText(tpl.sourceText);
                          setWizLanguage(tpl.language);
                          setWizStyle(tpl.style);
                          setWizCharacters(tpl.characters);
                        }}
                        className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 transition-all cursor-pointer"
                        data-testid={`template-btn-${idx}`}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {t(locale, 'projectTitleLabel')}
                  </label>
                  <Input
                    value={wizTitle}
                    onChange={(e) => setWizTitle(e.target.value)}
                    placeholder={t(locale, 'projectTitlePlaceholder')}
                    data-testid="wizard-title-input"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300">
                      {t(locale, 'sourceTextLabel')}
                    </label>
                    <Button
                      variant="magic"
                      size="sm"
                      onClick={handleMagicEnhanceIdea}
                      disabled={enhancingScript}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      {enhancingScript
                        ? 'AI đang viết...'
                        : '✨ AI Mở Rộng Thành Kịch Bản Chi Tiết'}
                    </Button>
                  </div>
                  <Textarea
                    rows={5}
                    value={wizSourceText}
                    onChange={(e) => setWizSourceText(e.target.value)}
                    placeholder={t(locale, 'sourceTextPlaceholder')}
                    data-testid="wizard-source-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">
                    {t(locale, 'languageLabel')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['vi', 'en', 'mixed'] as const).map((lang) => (
                      <Button
                        key={lang}
                        variant={wizLanguage === lang ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setWizLanguage(lang)}
                      >
                        {lang === 'vi'
                          ? '🇻🇳 Tiếng Việt (VI)'
                          : lang === 'en'
                          ? '🇺🇸 English (EN)'
                          : '🌐 Song ngữ (Mixed)'}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2.5">
                    {t(locale, 'styleLabel')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {STYLE_PRESETS.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setWizStyle(st.id)}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          wizStyle === st.id
                            ? 'border-violet-400 bg-violet-500/15 shadow-lg shadow-violet-500/15'
                            : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div
                          className={`h-8 w-full rounded-lg bg-gradient-to-r ${st.gradient} mb-2`}
                        />
                        <div className="text-xs font-bold text-white">{st.title}</div>
                        <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                          {st.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => setWizardStep(2)} data-testid="wizard-next-1">
                    {t(locale, 'nextStepBtn')} →
                  </Button>
                </div>
              </Card>
            )}

            {wizardStep === 2 && (
              <Card className="p-6 sm:p-8 space-y-5" data-testid="wizard-step-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold">{t(locale, 'wizardStep2')}</h3>
                    <p className="text-xs text-slate-400">
                      Mô tả ngoại hình nhân vật sẽ được AI tự động khóa đồng nhất xuyên suốt mọi cảnh.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setWizCharacters((prev) => [
                        ...prev,
                        { name: '', description: '', referenceImagePath: null },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t(locale, 'addCharacterBtn')}
                  </Button>
                </div>

                <div className="space-y-4">
                  {wizCharacters.map((char, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={char.name}
                          onChange={(e) =>
                            setWizCharacters((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                            )
                          }
                          placeholder={t(locale, 'charNamePlaceholder')}
                        />
                        {wizCharacters.length > 1 && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              setWizCharacters((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                      <Textarea
                        rows={2}
                        value={char.description}
                        onChange={(e) =>
                          setWizCharacters((prev) =>
                            prev.map((c, i) =>
                              i === idx ? { ...c, description: e.target.value } : c
                            )
                          )
                        }
                        placeholder={t(locale, 'charDescPlaceholder')}
                      />
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{t(locale, 'charImageLabel')}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleCharacterImageUpload(idx, f);
                          }}
                          className="text-xs text-slate-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => setWizardStep(1)}>
                    ← {t(locale, 'prevStepBtn')}
                  </Button>
                  <Button onClick={() => setWizardStep(3)} data-testid="wizard-next-2">
                    {t(locale, 'nextStepBtn')} →
                  </Button>
                </div>
              </Card>
            )}

            {wizardStep === 3 && (
              <Card className="p-6 sm:p-8 space-y-6" data-testid="wizard-step-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2.5">
                    {t(locale, 'aspectRatioLabel')}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['9:16', '16:9', '1:1'] as const).map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => setWizAspectRatio(ar)}
                        className={`p-4 rounded-2xl border text-center font-semibold transition-all cursor-pointer ${
                          wizAspectRatio === ar
                            ? 'border-violet-400 bg-violet-600/20 text-white shadow-lg'
                            : 'border-white/10 bg-white/[0.03] text-slate-400'
                        }`}
                      >
                        <div className="text-lg font-extrabold">{ar}</div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {ar === '9:16'
                            ? 'TikTok / Shorts / Reels'
                            : ar === '16:9'
                            ? 'YouTube Widescreen'
                            : 'Instagram / Square'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-300 mb-2">
                    <span>{t(locale, 'targetDurationLabel')}</span>
                    <span className="text-cyan-400 font-extrabold text-sm">
                      {wizTargetDuration}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={5}
                    value={wizTargetDuration}
                    onChange={(e) => setWizTargetDuration(Number(e.target.value))}
                    className="w-full accent-violet-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>10s</span>
                    <span>15s (TikTok/Shorts)</span>
                    <span>30s</span>
                    <span>60s</span>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="secondary" onClick={() => setWizardStep(2)}>
                    ← {t(locale, 'prevStepBtn')}
                  </Button>
                  <Button
                    onClick={handleCreateProjectAndStoryboard}
                    disabled={submittingWizard}
                    data-testid="create-storyboard-btn"
                  >
                    <Sparkles className="h-4 w-4" />
                    {submittingWizard ? 'Đang khởi tạo...' : t(locale, 'createStoryboardBtn')}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* PROJECT WORKSPACE: STORYBOARD EDITOR / PROGRESS / RESULT */}
        {view === 'project' && activeProject && (
          <div className="space-y-6">
            {/* Project Studio Control Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl sm:text-2xl font-extrabold text-white">
                    {activeProject.title}
                  </h1>
                  {renderStatusBadge(activeProject.status)}
                </div>
                <p className="text-xs text-slate-400">
                  Style: <strong className="text-violet-300">{activeProject.style}</strong> • Khung
                  hình: <strong>{activeProject.aspectRatio}</strong> •{' '}
                  {t(locale, 'totalDurationLabel')}: <strong>{totalSceneDuration}s</strong> •{' '}
                  {t(locale, 'estimatedCostLabel')}: <strong>${estimatedCost}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(activeProject.status === 'storyboard_ready' ||
                  activeProject.status === 'failed' ||
                  forceEditorMode) && (
                  <>
                    <Button variant="secondary" size="sm" onClick={handleAddScene}>
                      <Plus className="h-3.5 w-3.5" />
                      {t(locale, 'addSceneBtn')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRegenerateStoryboard}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t(locale, 'regenerateStoryboardBtn')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApproveAndGenerateVideo}
                      data-testid="approve-generate-btn"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t(locale, 'approveAndGenerateBtn')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* DRAFT / WAITING FOR STORYBOARD JOB */}
            {activeProject.status === 'draft' && activeProject.scenes.length === 0 && (
              <Card className="p-10 text-center space-y-4" data-testid="storyboard-loading">
                <div className="text-lg font-bold text-violet-300 animate-pulse">
                  ✨ AI Director đang phân tích kịch bản và dựng Storyboard...
                </div>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </Card>
            )}

            {/* SCREEN 4: STORYBOARD EDITOR (Split Studio View: Editor Cards + Live 60fps Preview Monitor) */}
            {(activeProject.status === 'storyboard_ready' ||
              forceEditorMode ||
              (activeProject.status === 'failed' && activeProject.scenes.length > 0)) && (
              <div
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                data-testid="storyboard-editor"
              >
                {/* Left 7 Columns: Editable Scene Cards */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">💡 {t(locale, 'dragHint')}</p>
                    <Badge variant="info">{activeProject.scenes.length} phân cảnh</Badge>
                  </div>

                  {activeProject.scenes.map((scene, idx) => {
                    let dialogueArr: DialogueItem[] = [];
                    try {
                      dialogueArr = JSON.parse(scene.dialogue || '[]');
                    } catch {}
                    const primaryLine = dialogueArr[0] || {
                      speaker: 'Narrator',
                      text: scene.narration,
                      language: activeProject.language === 'en' ? 'en' : 'vi',
                    };

                    return (
                      <Card
                        key={scene.id}
                        draggable
                        onDragStart={() => setDraggedSceneIdx(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedSceneIdx !== null && draggedSceneIdx !== idx) {
                            handleReorderScenes(draggedSceneIdx, idx);
                          }
                          setDraggedSceneIdx(null);
                        }}
                        onClick={() => setCinemaSceneIdx(idx)}
                        className={`p-5 space-y-4 transition-all ${
                          cinemaSceneIdx === idx
                            ? 'border-violet-500/60 shadow-lg shadow-violet-500/10'
                            : ''
                        }`}
                        data-testid={`scene-editor-card-${idx}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                          <div className="flex items-center gap-2.5 flex-1">
                            <span className="cursor-pointer h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow">
                              #{idx + 1}
                            </span>
                            <Input
                              value={scene.title}
                              onChange={(e) =>
                                handleSceneFieldUpdate(scene.id, { title: e.target.value })
                              }
                              className="max-w-md font-bold"
                              aria-label={t(locale, 'sceneTitleLabel')}
                            />
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => playSceneVoicePreview(scene)}
                              title="Nghe thử giọng đọc cảnh này"
                            >
                              <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={idx === 0}
                              onClick={() => handleReorderScenes(idx, idx - 1)}
                              aria-label={t(locale, 'moveUpBtn')}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={idx === activeProject.scenes.length - 1}
                              onClick={() => handleReorderScenes(idx, idx + 1)}
                              aria-label={t(locale, 'moveDownBtn')}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            {activeProject.scenes.length > 1 && (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeleteScene(scene.id)}
                                aria-label={t(locale, 'deleteSceneBtn')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-300 mb-1">
                                🎙 {t(locale, 'dialogueLabel')} ({primaryLine.language.toUpperCase()})
                              </label>
                              <Textarea
                                rows={3}
                                value={primaryLine.text}
                                onChange={(e) =>
                                  handleSceneFieldUpdate(scene.id, {
                                    narration: e.target.value,
                                    dialogue: [
                                      {
                                        speaker: primaryLine.speaker || 'Narrator',
                                        text: e.target.value,
                                        language: primaryLine.language || 'vi',
                                      },
                                    ],
                                  })
                                }
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">
                                  🎥 {t(locale, 'cameraMotionLabel')}
                                </label>
                                <select
                                  value={scene.cameraMotion}
                                  onChange={(e) =>
                                    handleSceneFieldUpdate(scene.id, {
                                      cameraMotion: e.target.value,
                                    })
                                  }
                                  aria-label={t(locale, 'cameraMotionLabel')}
                                  className="w-full rounded-xl border border-white/10 bg-[#070911] px-3 py-2 text-xs text-slate-100"
                                >
                                  {CAMERA_MOTIONS.map((cm) => (
                                    <option key={cm} value={cm}>
                                      {cm}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1">
                                  ⏱ {t(locale, 'durationSecLabel')}:{' '}
                                  <strong className="text-cyan-400">{scene.durationSec}s</strong>
                                </label>
                                <input
                                  type="range"
                                  min={2}
                                  max={20}
                                  value={scene.durationSec}
                                  onChange={(e) =>
                                    handleSceneFieldUpdate(scene.id, {
                                      durationSec: Number(e.target.value),
                                    })
                                  }
                                  className="w-full accent-violet-500 mt-2"
                                  aria-label={t(locale, 'durationSecLabel')}
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1">
                              🎨 {t(locale, 'visualPromptLabel')}
                            </label>
                            <Textarea
                              rows={5}
                              value={scene.visualPrompt}
                              onChange={(e) =>
                                handleSceneFieldUpdate(scene.id, { visualPrompt: e.target.value })
                              }
                              aria-label={t(locale, 'visualPromptLabel')}
                            />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Right 5 Columns: Sticky Live Studio Monitor */}
                <Card className="lg:col-span-5 p-5 space-y-4 sticky top-20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-violet-400" />
                      <h3 className="text-sm font-bold">Live Studio Canvas Monitor</h3>
                    </div>
                    <Badge variant="info">Scene #{cinemaSceneIdx + 1}</Badge>
                  </div>

                  {cinemaScenes.length > 0 && (
                    <CinemaCanvasPlayer
                      scenes={cinemaScenes}
                      styleName={activeProject.style}
                      aspectRatio={activeProject.aspectRatio}
                      showSubtitles={showSubtitles}
                      activeSceneIdx={cinemaSceneIdx}
                      isPlaying={cinemaPlaying}
                      onSceneChange={setCinemaSceneIdx}
                      onPlayStateChange={setCinemaPlaying}
                      projectTitle={activeProject.title}
                    />
                  )}
                </Card>
              </div>
            )}

            {/* SCREEN 5: GENERATION PROGRESS PAGE */}
            {(activeProject.status === 'generating' || activeProject.status === 'assembling') &&
              !forceEditorMode && (
                <Card className="p-6 space-y-6" data-testid="generation-progress-screen">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-white">{t(locale, 'progressHeading')}</h2>
                    <p className="text-xs text-slate-400">{t(locale, 'progressSub')}</p>
                  </div>

                  <div className="space-y-4">
                    {activeProject.scenes.map((scene, idx) => {
                      const pct =
                        scene.status === 'done'
                          ? 100
                          : scene.status === 'running'
                          ? 65
                          : scene.status === 'submitted'
                          ? 35
                          : 15;
                      return (
                        <div
                          key={scene.id}
                          className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-2"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold">
                              #{idx + 1} — {scene.title}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">
                                Video: {scene.videoPath ? '✓' : '...'} | TTS:{' '}
                                {scene.audioPath ? '✓' : '...'}
                              </span>
                              {renderStatusBadge(scene.status)}
                            </div>
                          </div>
                          <Progress value={pct} />
                          {scene.lastError && (
                            <div className="flex items-center justify-between text-xs text-rose-400 pt-1">
                              <span>Error: {scene.lastError}</span>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleRegenerateSingleScene(scene.id)}
                              >
                                {t(locale, 'retrySceneBtn')}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

            {/* SCREEN 6: RESULT PAGE */}
            {activeProject.status === 'done' && !forceEditorMode && (
              <div
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                data-testid="result-screen"
              >
                {/* Left 5 Columns: Cinema Canvas Monitor + MP4 / SRT Downloads */}
                <Card className="lg:col-span-5 p-5 flex flex-col items-center space-y-4">
                  <div className="w-full flex items-center justify-between">
                    <h2 className="font-bold text-base text-white">
                      {t(locale, 'resultHeading')}
                    </h2>
                    <Badge variant="success">{activeProject.aspectRatio} • HD</Badge>
                  </div>

                  {cinemaScenes.length > 0 && (
                    <CinemaCanvasPlayer
                      scenes={cinemaScenes}
                      styleName={activeProject.style}
                      aspectRatio={activeProject.aspectRatio}
                      showSubtitles={showSubtitles}
                      activeSceneIdx={cinemaSceneIdx}
                      isPlaying={cinemaPlaying}
                      onSceneChange={setCinemaSceneIdx}
                      onPlayStateChange={setCinemaPlaying}
                      projectTitle={activeProject.title}
                    />
                  )}

                  {/* Standard <video> element for direct MP4 playback & automated E2E tests */}
                  <details className="w-full text-xs text-slate-400">
                    <summary className="cursor-pointer hover:text-slate-200 py-1">
                      Trình phát file MP4 gốc (`final.mp4`)
                    </summary>
                    <video
                      key={activeProject.finalVideoPath || 'video'}
                      src={
                        activeProject.finalVideoPath
                          ? `/api/storage/${activeProject.finalVideoPath}`
                          : undefined
                      }
                      controls
                      playsInline
                      className="w-full rounded-xl mt-2 bg-black max-h-48"
                      data-testid="final-video-player"
                    />
                  </details>

                  <div className="flex flex-wrap items-center justify-center gap-2 w-full pt-1">
                    {activeProject.finalVideoPath && (
                      <a
                        href={`/api/storage/${activeProject.finalVideoPath}?download=1`}
                        download={`${activeProject.title.replace(/\s+/g, '_')}.mp4`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] border border-white/15 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/[0.14]"
                        data-testid="download-mp4-link"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t(locale, 'downloadMp4Btn')}
                      </a>
                    )}
                    {activeProject.subtitlePath && (
                      <a
                        href={`/api/storage/${activeProject.subtitlePath}?download=1`}
                        download={`${activeProject.title.replace(/\s+/g, '_')}.srt`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] border border-white/15 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.14]"
                        data-testid="download-srt-link"
                      >
                        <Subtitles className="h-3.5 w-3.5" />
                        {t(locale, 'downloadSrtBtn')}
                      </a>
                    )}
                    <Button
                      variant={showSubtitles ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setShowSubtitles(!showSubtitles)}
                      data-testid="subtitle-toggle-btn"
                    >
                      CC: {showSubtitles ? 'ON' : 'OFF'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setForceEditorMode(true)}>
                      ✎ {t(locale, 'backToEditorBtn')}
                    </Button>
                  </div>
                </Card>

                {/* Right 7 Columns: Scene Timeline Cards, Single-Scene Regenerate & Worker Job Logs */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                      Phân Cảnh Hoàn Chỉnh ({activeProject.scenes.length})
                    </h3>
                    <span className="text-xs text-slate-400">
                      Bấm vào cảnh bất kỳ để xem trên màn hình Cinema
                    </span>
                  </div>

                  {activeProject.scenes.map((scene, idx) => (
                    <Card
                      key={scene.id}
                      onClick={() => setCinemaSceneIdx(idx)}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-all ${
                        cinemaSceneIdx === idx
                          ? 'border-violet-500/60 bg-violet-500/[0.07]'
                          : 'hover:border-white/20'
                      }`}
                      data-testid={`result-scene-card-${idx}`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-violet-400">
                            #{idx + 1}
                          </span>
                          <h4 className="font-bold text-sm text-white">{scene.title}</h4>
                          <Badge variant="default">{scene.durationSec}s</Badge>
                          <Badge variant="info">{scene.cameraMotion}</Badge>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-1">{scene.narration}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          Prompt: {scene.visualPrompt}
                        </p>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => playSceneVoicePreview(scene)}
                        >
                          <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
                          {t(locale, 'listenTtsBtn')}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRegenerateSingleScene(scene.id)}
                          data-testid={`regenerate-scene-btn-${idx}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t(locale, 'regenerateSceneBtn')}
                        </Button>
                      </div>
                    </Card>
                  ))}

                  {/* Worker Job Logs Section */}
                  {activeProject.jobs && activeProject.jobs.length > 0 && (
                    <Card className="p-4 space-y-2.5">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {t(locale, 'jobLogsHeading')}
                      </h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                        {activeProject.jobs.slice(0, 8).map((job) => (
                          <div
                            key={job.id}
                            className="flex items-center justify-between border-b border-white/5 pb-1.5 text-slate-300"
                          >
                            <span>
                              <code className="text-violet-300">{job.type}</code> (attempts:{' '}
                              {job.attempts})
                            </span>
                            <div className="flex items-center gap-2">
                              {job.lastError && (
                                <span className="text-rose-400">{job.lastError}</span>
                              )}
                              {renderStatusBadge(job.status as SceneItem['status'])}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
