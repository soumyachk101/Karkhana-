'use client';

import {
  Check,
  ChevronRight,
  Copy,
  CornerDownLeft,
  Plus,
  RefreshCw,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

type Props = {
  cwd: string;
  projectName?: string;
};

type HistoryItem = {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  ts: number;
};

type TerminalTab = {
  id: string;
  title: string;
  history: HistoryItem[];
};

export function TerminalView({ cwd, projectName }: Props) {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'tab-1', title: 'zsh - main', history: [] },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [command, setCommand] = useState('');
  const [executing, setExecuting] = useState(false);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeTab.history.length, executing]);

  const addTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: TerminalTab = {
      id: newId,
      title: `zsh - session ${tabs.length + 1}`,
      history: [],
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // keep at least 1 tab
    const nextTabs = tabs.filter((t) => t.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) {
      setActiveTabId(nextTabs[0].id);
    }
  };

  const runCommand = async (cmdToRun?: string) => {
    const targetCmd = (cmdToRun || command).trim();
    if (!targetCmd || executing) return;

    setExecuting(true);
    if (!cmdToRun) setCommand('');
    setHistoryIdx(null);
    const startMs = Date.now();

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, command: targetCmd }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        stdout: string;
        stderr: string;
        exitCode: number;
      };
      const durationMs = Date.now() - startMs;

      const newItem: HistoryItem = {
        id: Math.random().toString(36).slice(2),
        command: targetCmd,
        stdout: data.stdout,
        stderr: data.stderr,
        exitCode: data.exitCode,
        durationMs,
        ts: Date.now(),
      };

      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, history: [...t.history, newItem] } : t
        )
      );
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const newItem: HistoryItem = {
        id: Math.random().toString(36).slice(2),
        command: targetCmd,
        stdout: '',
        stderr: (err as Error).message || 'Failed to execute command.',
        exitCode: 1,
        durationMs,
        ts: Date.now(),
      };

      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, history: [...t.history, newItem] } : t
        )
      );
    } finally {
      setExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void runCommand();
    } else if (e.key === 'ArrowUp') {
      if (!activeTab.history.length) return;
      e.preventDefault();
      const nextIdx =
        historyIdx === null ? activeTab.history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(nextIdx);
      setCommand(activeTab.history[nextIdx]?.command ?? '');
    } else if (e.key === 'ArrowDown') {
      if (historyIdx === null) return;
      e.preventDefault();
      const nextIdx = historyIdx + 1;
      if (nextIdx >= activeTab.history.length) {
        setHistoryIdx(null);
        setCommand('');
      } else {
        setHistoryIdx(nextIdx);
        setCommand(activeTab.history[nextIdx]?.command ?? '');
      }
    }
  };

  const copyOutput = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickPresets = [
    { label: 'git status', cmd: 'git status --short' },
    { label: 'git log', cmd: 'git log -n 5 --oneline' },
    { label: 'ls -la', cmd: 'ls -la' },
    { label: 'npm test', cmd: 'npm test' },
    { label: 'git diff', cmd: 'git diff' },
  ];

  return (
    <div className="flex h-full flex-col bg-[#0A0D14] font-mono text-[12px] selection:bg-emerald-500/30">
      {/* macOS Window Title Bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800/90 bg-[#121620] px-3.5 py-2 select-none">
        {/* Left Window Control Buttons & Tabs */}
        <div className="flex items-center gap-3">
          {/* macOS Action Dots */}
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#FF5F56] border border-[#E0443E]/50 shadow-sm" />
            <div className="h-3 w-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]/50 shadow-sm" />
            <div className="h-3 w-3 rounded-full bg-[#27C93F] border border-[#1AAB29]/50 shadow-sm" />
          </div>

          {/* Terminal Tabs */}
          <div className="flex items-center gap-1 ml-2">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`flex items-center gap-2 rounded-t-lg border-t border-x px-3 py-1 text-[11px] font-medium cursor-pointer transition ${
                  activeTabId === tab.id
                    ? 'border-emerald-500/40 bg-[#0A0D14] text-emerald-300 font-semibold shadow-sm'
                    : 'border-transparent bg-slate-900/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                <TerminalIcon className="h-3 w-3 text-emerald-400" />
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => closeTab(tab.id, e)}
                    className="rounded p-0.5 hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTab}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition"
              title="New Terminal Session"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Directory Breadcrumb */}
        <div className="flex items-center gap-2">
          <span className="truncate rounded-md bg-slate-900/80 border border-slate-800 px-2.5 py-0.5 text-[10px] text-slate-400 font-mono">
            📁 {cwd}
          </span>
          <button
            onClick={() =>
              setTabs((prev) =>
                prev.map((t) => (t.id === activeTabId ? { ...t, history: [] } : t))
              )
            }
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            title="Clear Terminal Screen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Action Preset Chips Bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-800/60 bg-[#0E121C] px-3.5 py-1.5 overflow-x-auto scrollbar-none">
        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mr-1">
          Quick Actions:
        </span>
        {quickPresets.map((preset) => (
          <button
            key={preset.label}
            disabled={executing}
            onClick={() => void runCommand(preset.cmd)}
            className="rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-50 transition shadow-sm"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Output Stream Canvas */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4 font-mono select-text"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="text-[11px] text-slate-500">
          Last login: {mounted ? new Date().toLocaleTimeString() : '---'} on ttys001 (Karkhana iTerm Studio)
        </div>

        {activeTab.history.map((item) => (
          <div key={item.id} className="space-y-1.5 group">
            {/* Command Header Prompt */}
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-2 font-semibold">
                <span className="text-emerald-400 select-none">➜</span>
                <span className="text-cyan-400 select-none">
                  {projectName || 'karkhana'}
                </span>
                <span className="text-purple-400 font-normal select-none">git:(main)</span>
                <span className="text-amber-300 select-none">✗</span>
                <span className="text-slate-100">{item.command}</span>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span>{item.durationMs}ms</span>
                <span
                  className={`rounded px-1.5 py-0.2 font-mono ${
                    item.exitCode === 0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  exit {item.exitCode}
                </span>
                <button
                  onClick={() => copyOutput(item.id, item.stdout || item.stderr)}
                  className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition"
                  title="Copy Output"
                >
                  {copiedId === item.id ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>

            {/* Standard Output Block */}
            {Boolean(item.stdout) && (
              <div className="rounded-lg border border-slate-800/90 bg-[#07090F] p-3 text-slate-200 whitespace-pre-wrap break-all text-[11px] leading-relaxed font-mono shadow-inner">
                {item.stdout}
              </div>
            )}

            {/* Standard Error Block */}
            {Boolean(item.stderr) && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-red-300 whitespace-pre-wrap break-all text-[11px] leading-relaxed font-mono">
                {item.stderr}
              </div>
            )}
          </div>
        ))}

        {executing && (
          <div className="flex items-center gap-2 text-emerald-400 animate-pulse text-[11px]">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>Executing in background shell...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Real Terminal Interactive Prompt Input */}
      <div className="border-t border-slate-800 bg-[#0D1018] px-3.5 py-2.5">
        <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-black/90 px-3.5 py-2 focus-within:border-emerald-500/80 focus-within:ring-2 focus-within:ring-emerald-500/20 transition shadow-lg">
          <span className="text-emerald-400 font-bold select-none">➜</span>
          <span className="text-cyan-400 font-medium select-none text-[11px]">
            {projectName || 'karkhana'}
          </span>
          <span className="text-slate-500 select-none">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={executing}
            placeholder="Enter bash command (e.g., git status, npm test, cat hello.md)..."
            className="w-full bg-transparent font-mono text-[12px] text-emerald-300 placeholder-slate-600 outline-none disabled:opacity-50"
            autoFocus
          />
          <button
            onClick={() => void runCommand()}
            disabled={!command.trim() || executing}
            className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500 hover:text-black disabled:opacity-30 transition"
          >
            <CornerDownLeft className="h-3 w-3" />
            Exec
          </button>
        </div>
      </div>
    </div>
  );
}
