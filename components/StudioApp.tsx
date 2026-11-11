'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  Progress,
  Skeleton,
  Textarea,
} from './ui/primitives.tsx';
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

const STYLE_CHIPS = [
  'anime fairy tale',
  'realistic cinematic',
  '3D cartoon',
  'cyberpunk neon',
  'watercolor storybook',
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
    label: '🚀 3 Bí Quyết Học Tập Với AI (3D Cartoon)',
    title: '3 Bí Quyết Tăng Tốc Học Tập Cùng AI',
    sourceType: 'script' as const,
    sourceText:
      'Cảnh 1: Đặt câu hỏi đúng trọng tâm. Cảnh 2: Tóm tắt kiến thức bằng sơ đồ tư duy. Cảnh 3: Tự kiểm tra lại bằng bài tập thực hành.',
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

  // Wizard state (3 steps)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizTitle, setWizTitle] = useState('');
  const [wizSourceType, setWizSourceType] = useState<'idea' | 'script'>('idea');
  const [wizSourceText, setWizSourceText] = useState('');
  const [wizLanguage, setWizLanguage] = useState<'vi' | 'en' | 'mixed'>('vi');
  const [wizStyle, setWizStyle] = useState('anime fairy tale');
  const [wizCharacters, setWizCharacters] = useState<CharacterItem[]>([
    { name: 'Linh', description: 'young Vietnamese explorer in a glowing cyberpunk jacket' },
  ]);
  const [wizAspectRatio, setWizAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [wizTargetDuration, setWizTargetDuration] = useState(15);
  const [submittingWizard, setSubmittingWizard] = useState(false);

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
          await fetchProjects();
        }
      } finally {
        setAuthChecking(false);
      }
    })();
  }, [fetchProjects]);

  // Live polling every 1.5s when activeProject is in draft, generating, or assembling
  useEffect(() => {
    if (!activeProject || view !== 'project') return;
    const isBusy =
      activeProject.status === 'draft' ||
      activeProject.status === 'generating' ||
      activeProject.status === 'assembling';
    if (!isBusy) return;

    const timer = setInterval(() => {
      fetchActiveProject(activeProject.id);
    }, 1500);

    return () => clearInterval(timer);
  }, [activeProject, view, fetchActiveProject]);

  // Multi-Scene Cinema Preview sequencer (plays each scene's TTS audio & advances scenes automatically)
  useEffect(() => {
    if (!cinemaPlaying || !activeProject || activeProject.scenes.length === 0) return;
    const scene = activeProject.scenes[cinemaSceneIdx];
    if (!scene) {
      setCinemaPlaying(false);
      setCinemaSceneIdx(0);
      return;
    }

    if (scene.audioPath && audioRef.current) {
      audioRef.current.src = `/api/storage/${scene.audioPath}`;
      audioRef.current.play().catch(() => {});
    }

    const timer = setTimeout(() => {
      if (cinemaSceneIdx + 1 < activeProject.scenes.length) {
        setCinemaSceneIdx(cinemaSceneIdx + 1);
      } else {
        setCinemaPlaying(false);
        setCinemaSceneIdx(0);
      }
    }, (scene.durationSec || 5) * 1000);

    return () => clearTimeout(timer);
  }, [cinemaPlaying, cinemaSceneIdx, activeProject]);

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
    showToast(`Xin chào, ${data.user.name}!`, 'success');
    await fetchProjects();
  }

  async function handleDemoLogin() {
    const res = await fetch('/api/auth/demo', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      await refreshUser();
      showToast(`Đã đăng nhập: ${data.user.email}`, 'success');
      await fetchProjects();
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setActiveProject(null);
    setView('dashboard');
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
      showToast('Vui lòng nhập tiêu đề và ý tưởng/kịch bản (ít nhất 5 ký tự)', 'error');
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
      setView('project');
      showToast('Đang tạo Storyboard từ kịch bản...', 'info');
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
    showToast('Đã bắt đầu tạo Video & TTS cho tất cả phân cảnh!', 'success');
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
    showToast('Đang tạo lại phân cảnh và ghép lại MP4...', 'info');
    await fetchActiveProject(activeProject.id);
  }

  function playSceneTtsAudio(audioPath: string) {
    if (!audioRef.current) return;
    audioRef.current.src = `/api/storage/${audioPath}`;
    audioRef.current.play().catch(() => {});
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
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex items-center justify-center">
        <Skeleton className="h-64 w-full max-w-md" />
      </div>
    );
  }

  // SCREEN 1: AUTH PAGE
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-lg shadow-lg">
            AI
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t(locale, 'appName')}</h1>
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

        <Card className="w-full max-w-md p-6 space-y-5" data-testid="auth-card">
          <h2 className="text-xl font-semibold">
            {authMode === 'login' ? t(locale, 'loginTitle') : t(locale, 'registerTitle')}
          </h2>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
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
              <label className="block text-xs font-medium text-slate-300 mb-1">
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
              <label className="block text-xs font-medium text-slate-300 mb-1">
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

            <Button type="submit" className="w-full" data-testid="auth-submit-btn">
              {authMode === 'login' ? t(locale, 'loginBtn') : t(locale, 'registerBtn')}
            </Button>
          </form>

          <div className="relative py-1 text-center">
            <span className="text-xs text-slate-500">HOẶC / OR</span>
          </div>

          <Button
            variant="secondary"
            className="w-full"
            onClick={handleDemoLogin}
            data-testid="demo-login-btn"
          >
            ⚡ {t(locale, 'demoLoginBtn')}
          </Button>

          <button
            type="button"
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            className="w-full text-center text-xs text-indigo-400 hover:underline"
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
  const currentCinemaScene =
    activeProject?.scenes[cinemaSceneIdx] || activeProject?.scenes[0] || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <audio ref={audioRef} className="hidden" />

      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setCinemaPlaying(false);
              setView('dashboard');
              fetchProjects();
            }}
            className="flex items-center gap-2.5 text-left focus:outline-none"
          >
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow">
              AI
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block">
                {t(locale, 'appName')}
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:block">
                {t(locale, 'quotaBadge')}: {user.dailyQuotaUsed ?? 0}/{user.dailyQuotaLimit ?? 30}{' '}
                scenes
              </span>
            </div>
          </button>
        </div>

        <nav className="flex items-center gap-2 sm:gap-3">
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
            {t(locale, 'navDashboard')}
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
            + {t(locale, 'navNewProject')}
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
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            {t(locale, 'navLogout')}
          </Button>
        </nav>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-xl border ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/40 text-rose-200'
              : toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
              : 'bg-slate-900/95 border-indigo-500/40 text-indigo-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6">
        {/* SCREEN 2: DASHBOARD */}
        {view === 'dashboard' && (
          <div className="space-y-6" data-testid="dashboard-screen">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">{t(locale, 'dashboardHeading')}</h1>
                <p className="text-sm text-slate-400">{t(locale, 'dashboardSub')}</p>
              </div>
              <Button
                onClick={() => {
                  setWizardStep(1);
                  setWizTitle('');
                  setWizSourceText('');
                  setView('wizard');
                }}
                data-testid="dashboard-new-project-btn"
              >
                + {t(locale, 'navNewProject')}
              </Button>
            </div>

            {loadingProjects ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Skeleton className="h-48" />
                <Skeleton className="h-48" />
                <Skeleton className="h-48" />
              </div>
            ) : projects.length === 0 ? (
              <Card className="p-12 text-center space-y-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xl font-bold">
                  🎬
                </div>
                <h3 className="text-lg font-semibold">{t(locale, 'emptyProjectsTitle')}</h3>
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
                  {t(locale, 'createFirstBtn')}
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((proj) => (
                  <Card
                    key={proj.id}
                    className="p-5 flex flex-col justify-between hover:border-indigo-500/50 transition-all cursor-pointer"
                    onClick={() => {
                      setActiveProject(proj);
                      setForceEditorMode(false);
                      setCinemaPlaying(false);
                      setView('project');
                    }}
                    data-testid={`project-card-${proj.id}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base line-clamp-1">{proj.title}</h3>
                        {renderStatusBadge(proj.status)}
                      </div>
                      <div className="h-28 rounded-lg bg-gradient-to-br from-indigo-950/80 via-slate-900 to-violet-950/60 border border-slate-800 flex flex-col items-center justify-center p-3 text-center">
                        <span className="text-xs font-semibold text-indigo-300">
                          {proj.style} • {proj.aspectRatio} • {proj.targetDurationSec}s
                        </span>
                        <span className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                          {proj.scenes?.[0]?.title || proj.sourceText}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">{proj.sourceText}</p>
                    </div>
                    <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <span>
                        {proj.scenes?.length || 0} scenes • {proj.language.toUpperCase()}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(e, proj.id)}
                        className="text-rose-400 hover:underline text-xs"
                        aria-label={t(locale, 'deleteProjectBtn')}
                      >
                        {t(locale, 'deleteProjectBtn')}
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCREEN 3: NEW PROJECT WIZARD (3 STEPS) */}
        {view === 'wizard' && (
          <div className="max-w-2xl mx-auto space-y-6" data-testid="wizard-screen">
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-4">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setWizardStep(s as 1 | 2 | 3)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    wizardStep === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
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
              <Card className="p-6 space-y-5" data-testid="wizard-step-1">
                {/* 1-Click Preset Templates */}
                <div className="space-y-2">
                  <span className="block text-xs font-medium text-indigo-300">
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
                        className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/20"
                        data-testid={`template-btn-${idx}`}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t(locale, 'projectTitleLabel')}
                  </label>
                  <Input
                    value={wizTitle}
                    onChange={(e) => setWizTitle(e.target.value)}
                    placeholder={t(locale, 'projectTitlePlaceholder')}
                    data-testid="wizard-title-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWizSourceType('idea')}
                    className={`p-3 rounded-lg border text-sm font-medium text-left ${
                      wizSourceType === 'idea'
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    💡 {t(locale, 'sourceTypeIdea')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizSourceType('script')}
                    className={`p-3 rounded-lg border text-sm font-medium text-left ${
                      wizSourceType === 'script'
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    📜 {t(locale, 'sourceTypeScript')}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t(locale, 'sourceTextLabel')}
                  </label>
                  <Textarea
                    rows={4}
                    value={wizSourceText}
                    onChange={(e) => setWizSourceText(e.target.value)}
                    placeholder={t(locale, 'sourceTextPlaceholder')}
                    data-testid="wizard-source-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t(locale, 'languageLabel')}
                  </label>
                  <div className="flex gap-2">
                    {(['vi', 'en', 'mixed'] as const).map((lang) => (
                      <Button
                        key={lang}
                        variant={wizLanguage === lang ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setWizLanguage(lang)}
                      >
                        {lang === 'vi'
                          ? 'Tiếng Việt (VI)'
                          : lang === 'en'
                          ? 'English (EN)'
                          : 'Song ngữ (Mixed)'}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t(locale, 'styleLabel')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {STYLE_CHIPS.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setWizStyle(st)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          wizStyle === st
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {st}
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
              <Card className="p-6 space-y-5" data-testid="wizard-step-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{t(locale, 'wizardStep2')}</h3>
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
                    + {t(locale, 'addCharacterBtn')}
                  </Button>
                </div>

                <div className="space-y-4">
                  {wizCharacters.map((char, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-slate-800 bg-slate-950/60 space-y-3"
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
              <Card className="p-6 space-y-6" data-testid="wizard-step-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    {t(locale, 'aspectRatioLabel')}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['9:16', '16:9', '1:1'] as const).map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => setWizAspectRatio(ar)}
                        className={`p-4 rounded-xl border text-center font-medium ${
                          wizAspectRatio === ar
                            ? 'border-indigo-500 bg-indigo-600/20 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-400'
                        }`}
                      >
                        <div className="text-base font-bold">{ar}</div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {ar === '9:16'
                            ? 'TikTok / Shorts'
                            : ar === '16:9'
                            ? 'YouTube'
                            : 'Square'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-300 mb-2">
                    <span>{t(locale, 'targetDurationLabel')}</span>
                    <span className="text-indigo-400 font-bold">{wizTargetDuration}s</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={60}
                    step={5}
                    value={wizTargetDuration}
                    onChange={(e) => setWizTargetDuration(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>10s</span>
                    <span>15s (Recommended)</span>
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
                    {submittingWizard ? '...' : `✨ ${t(locale, 'createStoryboardBtn')}`}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* PROJECT VIEW: STORYBOARD EDITOR / PROGRESS / RESULT */}
        {view === 'project' && activeProject && (
          <div className="space-y-6">
            {/* Project Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold">{activeProject.title}</h1>
                  {renderStatusBadge(activeProject.status)}
                </div>
                <p className="text-xs text-slate-400">
                  {activeProject.style} • {activeProject.aspectRatio} •{' '}
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
                      + {t(locale, 'addSceneBtn')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleRegenerateStoryboard}>
                      ↻ {t(locale, 'regenerateStoryboardBtn')}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleApproveAndGenerateVideo}
                      data-testid="approve-generate-btn"
                    >
                      🚀 {t(locale, 'approveAndGenerateBtn')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* DRAFT / WAITING FOR STORYBOARD JOB */}
            {activeProject.status === 'draft' && activeProject.scenes.length === 0 && (
              <Card className="p-10 text-center space-y-4" data-testid="storyboard-loading">
                <div className="text-lg font-semibold animate-pulse">
                  ✨ Đang phân tích kịch bản và khởi tạo Storyboard...
                </div>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </Card>
            )}

            {/* SCREEN 4: STORYBOARD EDITOR (with Drag-and-Drop + Inline Edit) */}
            {(activeProject.status === 'storyboard_ready' ||
              forceEditorMode ||
              (activeProject.status === 'failed' && activeProject.scenes.length > 0)) && (
              <div className="space-y-4" data-testid="storyboard-editor">
                <p className="text-xs text-slate-400">💡 {t(locale, 'dragHint')}</p>
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
                      className="p-5 space-y-4"
                      data-testid={`scene-editor-card-${idx}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5 flex-1">
                          <span
                            title="Drag handle"
                            className="cursor-pointer h-7 w-7 rounded-full bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center justify-center"
                          >
                            #{idx + 1}
                          </span>
                          <Input
                            value={scene.title}
                            onChange={(e) =>
                              handleSceneFieldUpdate(scene.id, { title: e.target.value })
                            }
                            className="max-w-md font-semibold"
                            aria-label={t(locale, 'sceneTitleLabel')}
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={idx === 0}
                            onClick={() => handleReorderScenes(idx, idx - 1)}
                            aria-label={t(locale, 'moveUpBtn')}
                          >
                            ↑ {t(locale, 'moveUpBtn')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={idx === activeProject.scenes.length - 1}
                            onClick={() => handleReorderScenes(idx, idx + 1)}
                            aria-label={t(locale, 'moveDownBtn')}
                          >
                            ↓ {t(locale, 'moveDownBtn')}
                          </Button>
                          {activeProject.scenes.length > 1 && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteScene(scene.id)}
                              aria-label={t(locale, 'deleteSceneBtn')}
                            >
                              {t(locale, 'deleteSceneBtn')}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">
                              {t(locale, 'dialogueLabel')} ({primaryLine.language.toUpperCase()})
                            </label>
                            <Textarea
                              rows={2}
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
                              <label className="block text-xs font-medium text-slate-400 mb-1">
                                {t(locale, 'cameraMotionLabel')}
                              </label>
                              <select
                                value={scene.cameraMotion}
                                onChange={(e) =>
                                  handleSceneFieldUpdate(scene.id, {
                                    cameraMotion: e.target.value,
                                  })
                                }
                                aria-label={t(locale, 'cameraMotionLabel')}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                              >
                                {CAMERA_MOTIONS.map((cm) => (
                                  <option key={cm} value={cm}>
                                    {cm}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-400 mb-1">
                                {t(locale, 'durationSecLabel')}:{' '}
                                <strong className="text-indigo-400">{scene.durationSec}s</strong>
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
                                className="w-full accent-indigo-500 mt-2"
                                aria-label={t(locale, 'durationSecLabel')}
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">
                            {t(locale, 'visualPromptLabel')}
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
            )}

            {/* SCREEN 5: GENERATION PROGRESS PAGE */}
            {(activeProject.status === 'generating' || activeProject.status === 'assembling') &&
              !forceEditorMode && (
                <Card className="p-6 space-y-6" data-testid="generation-progress-screen">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold">{t(locale, 'progressHeading')}</h2>
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
                          className="p-4 rounded-lg border border-slate-800 bg-slate-950/60 space-y-2"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">
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
                {/* Video & Interactive Multi-Scene Cinema Preview Column */}
                <Card className="lg:col-span-5 p-5 flex flex-col items-center space-y-4">
                  <div className="w-full flex items-center justify-between">
                    <h2 className="font-bold text-base">{t(locale, 'resultHeading')}</h2>
                    <Badge variant="info">{activeProject.aspectRatio}</Badge>
                  </div>

                  <div
                    className={`relative w-full overflow-hidden rounded-xl border border-slate-800 bg-black flex items-center justify-center ${
                      activeProject.aspectRatio === '9:16'
                        ? 'max-w-[280px] aspect-[9/16]'
                        : activeProject.aspectRatio === '1:1'
                        ? 'max-w-[340px] aspect-square'
                        : 'aspect-video'
                    }`}
                  >
                    <video
                      key={activeProject.finalVideoPath || 'video'}
                      src={
                        activeProject.finalVideoPath
                          ? `/api/storage/${activeProject.finalVideoPath}`
                          : undefined
                      }
                      controls
                      playsInline
                      className="h-full w-full object-contain"
                      data-testid="final-video-player"
                    />

                    {/* Interactive Multi-Scene Cinema Visual Overlay when playing preview */}
                    {cinemaPlaying && currentCinemaScene && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950/90 via-slate-900/90 to-violet-950/90 p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-[11px] text-indigo-300">
                          <span>
                            Scene #{cinemaSceneIdx + 1}/{activeProject.scenes.length}
                          </span>
                          <span>🎥 {currentCinemaScene.cameraMotion}</span>
                        </div>
                        <div className="my-auto text-center space-y-2">
                          <div className="text-sm font-bold text-white">
                            {currentCinemaScene.title}
                          </div>
                          <p className="text-[11px] text-slate-300 line-clamp-3">
                            {currentCinemaScene.visualPrompt}
                          </p>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-indigo-500 w-full animate-pulse" />
                        </div>
                      </div>
                    )}

                    {/* Subtitle Overlay */}
                    {showSubtitles && currentCinemaScene && (
                      <div
                        className="pointer-events-none absolute bottom-12 inset-x-3 text-center"
                        data-testid="subtitle-overlay"
                      >
                        <span className="inline-block rounded bg-black/80 px-2.5 py-1 text-xs font-medium text-yellow-300 shadow">
                          {(() => {
                            try {
                              const d = JSON.parse(currentCinemaScene.dialogue || '[]');
                              return d[0]?.text || currentCinemaScene.narration;
                            } catch {
                              return currentCinemaScene.narration;
                            }
                          })()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Interactive Multi-Scene + TTS Player Toggle */}
                  <Button
                    variant={cinemaPlaying ? 'danger' : 'primary'}
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (cinemaPlaying) {
                        setCinemaPlaying(false);
                        audioRef.current?.pause();
                      } else {
                        setCinemaSceneIdx(0);
                        setCinemaPlaying(true);
                      }
                    }}
                    data-testid="cinema-preview-btn"
                  >
                    {cinemaPlaying
                      ? `⏹ ${t(locale, 'stopPreviewBtn')}`
                      : `▶ ${t(locale, 'cinemaPreviewBtn')}`}
                  </Button>

                  <div className="flex flex-wrap items-center justify-center gap-2 w-full pt-1">
                    {activeProject.finalVideoPath && (
                      <a
                        href={`/api/storage/${activeProject.finalVideoPath}?download=1`}
                        download={`${activeProject.title.replace(/\s+/g, '_')}.mp4`}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                        data-testid="download-mp4-link"
                      >
                        ⬇ {t(locale, 'downloadMp4Btn')}
                      </a>
                    )}
                    {activeProject.subtitlePath && (
                      <a
                        href={`/api/storage/${activeProject.subtitlePath}?download=1`}
                        download={`${activeProject.title.replace(/\s+/g, '_')}.srt`}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                        data-testid="download-srt-link"
                      >
                        📝 {t(locale, 'downloadSrtBtn')}
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

                {/* Scene Breakdown, Single-Scene Regeneration & Job Logs Column */}
                <div className="lg:col-span-7 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    Scenes ({activeProject.scenes.length})
                  </h3>
                  {activeProject.scenes.map((scene, idx) => (
                    <Card
                      key={scene.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      data-testid={`result-scene-card-${idx}`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-indigo-400">#{idx + 1}</span>
                          <h4 className="font-semibold text-sm">{scene.title}</h4>
                          <Badge variant="default">{scene.durationSec}s</Badge>
                          <Badge variant="default">{scene.cameraMotion}</Badge>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-1">{scene.narration}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          Prompt: {scene.visualPrompt}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {scene.audioPath && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => playSceneTtsAudio(scene.audioPath!)}
                          >
                            🔊 {t(locale, 'listenTtsBtn')}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRegenerateSingleScene(scene.id)}
                          data-testid={`regenerate-scene-btn-${idx}`}
                        >
                          ↻ {t(locale, 'regenerateSceneBtn')}
                        </Button>
                      </div>
                    </Card>
                  ))}

                  {/* Worker Job Logs Section */}
                  {activeProject.jobs && activeProject.jobs.length > 0 && (
                    <Card className="p-4 space-y-2">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase">
                        {t(locale, 'jobLogsHeading')}
                      </h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                        {activeProject.jobs.slice(0, 8).map((job) => (
                          <div
                            key={job.id}
                            className="flex items-center justify-between border-b border-slate-800/60 pb-1 text-slate-300"
                          >
                            <span>
                              <code>{job.type}</code> (attempts: {job.attempts})
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
