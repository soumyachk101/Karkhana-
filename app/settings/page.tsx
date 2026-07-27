'use client';

import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  Key,
  Layers,
  Save,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { TopBar } from '@/app/components/TopBar';
import { type Project } from '@/lib/types';

type Config = {
  claudeBinPath?: string;
  antigravityBinPath?: string;
  codexBinPath?: string;
  claudeEnabled?: boolean;
  autoMerge?: boolean;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  concurrency?: number;
  worktreeRoot?: string | null;
  dbPath?: string;
};

export default function SettingsPage() {
  const [config, setConfig] = useState<Config>({
    claudeEnabled: false,
    autoMerge: true,
    concurrency: 10,
    anthropicApiKey: '',
    openaiApiKey: '',
    geminiApiKey: '',
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data: Config) => setConfig(data))
      .catch((err) => console.error('Failed to load config:', err));

    fetch('/api/projects')
      .then((res) => res.json())
      .then((data: { projects: Project[] }) => setProjects(data.projects || []))
      .catch((err) => console.error('Failed to load projects:', err));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSavedNotice(false);
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#07090E] font-sans text-ink-100 antialiased selection:bg-forge-500/30">
      {/* Top Navigation */}
      <TopBar
        projects={projects}
        selectedProjectId={null}
        onSelectProject={() => {}}
        onNewTask={() => {}}
        onOpenApiKeys={() => {}}
        runningCount={0}
        queuedCount={0}
        concurrencyLimit={config.concurrency || 10}
        activeTab="settings"
      />

      {/* Settings Main Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        {/* Header Title */}
        <div className="flex items-center justify-between border-b border-ink-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-forge-500/30 to-amber-500/10 border border-forge-500/40 text-forge-400">
                <Settings className="h-4 w-4" />
              </div>
              <h1 className="font-display text-[20px] font-bold tracking-tight text-ink-50">
                Engine & SaaS Control Matrix
              </h1>
            </div>
            <p className="mt-1 text-[12px] text-ink-400">
              Configure AI agent runners, API keys, concurrency policies, and real-time auto-merge defaults
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-forge-500 to-amber-500 px-5 py-2 text-[12px] font-semibold text-ink-900 shadow-lg shadow-forge-500/20 hover:brightness-110 disabled:opacity-50 transition"
          >
            {saving ? (
              <span>Saving...</span>
            ) : savedNotice ? (
              <>
                <Check className="h-4 w-4 text-emerald-950" />
                <span>Saved Successfully!</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Configuration</span>
              </>
            )}
          </button>
        </div>

        {/* Engine Status Health Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Antigravity Card */}
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-ink-900/90 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-amber-400">
                <Zap className="h-4 w-4" />
                <span>Antigravity CLI</span>
              </div>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 font-mono">
                Active & Native
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              Google DeepMind Gemini 3.6 Flash & 3.1 Pro Native Runner
            </p>
            <div className="mt-3 font-mono text-[10px] text-ink-500">
              Binary: /Users/soumyachakraborty/.local/bin/agy
            </div>
          </div>

          {/* Codex Card */}
          <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 to-ink-900/90 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-cyan-400">
                <Bot className="h-4 w-4" />
                <span>Codex CLI</span>
              </div>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 font-mono">
                Active & Proxy
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              OpenAI Codex GPT-5.5, GPT-4o & o3-mini via OmniRoute Proxy (Port 20128)
            </p>
            <div className="mt-3 font-mono text-[10px] text-ink-500">
              Binary: /Users/soumyachakraborty/.npm-global/bin/codex
            </div>
          </div>

          {/* Claude Code Card */}
          <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/20 to-ink-900/90 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-[14px] font-bold text-violet-400">
                <Sparkles className="h-4 w-4" />
                <span>Claude Code CLI</span>
              </div>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold font-mono ${
                  config.claudeEnabled
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-ink-800 text-ink-400'
                }`}
              >
                {config.claudeEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              Anthropic Claude Code Agent runner (Toggle when subscription active)
            </p>
            <div className="mt-3 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-ink-300">
                <input
                  type="checkbox"
                  checked={Boolean(config.claudeEnabled)}
                  onChange={(e) => setConfig((c) => ({ ...c, claudeEnabled: e.target.checked }))}
                  className="rounded border-ink-700 bg-ink-950 text-violet-500 focus:ring-violet-500"
                />
                <span>Enable Claude Models</span>
              </label>
            </div>
          </div>
        </div>

        {/* Execution & Automation Settings */}
        <div className="rounded-xl border border-ink-800 bg-ink-900/80 p-5 space-y-4">
          <h2 className="font-display text-[15px] font-bold text-ink-100 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-forge-400" />
            <span>Execution Policies & Automation</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Auto Merge Toggle */}
            <div className="rounded-lg border border-ink-800 bg-black/40 p-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-[13px] font-semibold text-ink-200">
                  Real-time Auto-Merge to Local Workspace
                </h3>
                <p className="mt-1 text-[11px] text-ink-400 leading-relaxed">
                  When enabled, agent task completions automatically merge modified files directly into your local project directory so you can inspect changes in real time.
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(config.autoMerge)}
                onChange={(e) => setConfig((c) => ({ ...c, autoMerge: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-ink-700 bg-ink-950 text-forge-500 focus:ring-forge-500"
              />
            </div>

            {/* Concurrency Limit */}
            <div className="rounded-lg border border-ink-800 bg-black/40 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[13px] font-semibold text-ink-200">
                  Max Concurrent Agent Tasks
                </h3>
                <span className="font-mono text-[14px] font-bold text-forge-400">
                  {config.concurrency ?? 10} tasks
                </span>
              </div>
              <p className="mt-1 text-[11px] text-ink-400 leading-relaxed">
                Maximum number of parallel tasks executing simultaneously. Excess tasks automatically queue FIFO.
              </p>
              <input
                type="range"
                min={1}
                max={20}
                value={config.concurrency ?? 10}
                onChange={(e) => setConfig((c) => ({ ...c, concurrency: Number(e.target.value) }))}
                className="mt-3 w-full accent-forge-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* API Keys Vault */}
        <div className="rounded-xl border border-ink-800 bg-ink-900/80 p-5 space-y-4">
          <h2 className="font-display text-[15px] font-bold text-ink-100 flex items-center gap-2">
            <Key className="h-4 w-4 text-forge-400" />
            <span>API Keys Vault</span>
          </h2>

          <div className="space-y-3 pt-1 font-mono text-[12px]">
            <div>
              <label className="block text-[11px] text-ink-300 mb-1">
                Anthropic API Key (Claude Code)
              </label>
              <input
                type="password"
                value={config.anthropicApiKey || ''}
                onChange={(e) => setConfig((c) => ({ ...c, anthropicApiKey: e.target.value }))}
                placeholder="sk-ant-api03-..."
                className="w-full rounded border border-ink-700 bg-black px-3 py-2 text-ink-100 placeholder-ink-600 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-ink-300 mb-1">
                OpenAI API Key (Codex)
              </label>
              <input
                type="password"
                value={config.openaiApiKey || ''}
                onChange={(e) => setConfig((c) => ({ ...c, openaiApiKey: e.target.value }))}
                placeholder="sk-proj-..."
                className="w-full rounded border border-ink-700 bg-black px-3 py-2 text-ink-100 placeholder-ink-600 outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-ink-300 mb-1">
                Gemini / Antigravity API Key
              </label>
              <input
                type="password"
                value={config.geminiApiKey || ''}
                onChange={(e) => setConfig((c) => ({ ...c, geminiApiKey: e.target.value }))}
                placeholder="AIzaSy..."
                className="w-full rounded border border-ink-700 bg-black px-3 py-2 text-ink-100 placeholder-ink-600 outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
