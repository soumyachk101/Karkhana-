'use client';

import { Folder, Play, RefreshCcw, Sparkles, Terminal as TerminalIcon } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useState } from 'react';
import { TerminalView } from '@/app/components/TerminalView';
import { TopBar } from '@/app/components/TopBar';
import { type Project } from '@/lib/types';

function TerminalStudioInner() {
  const searchParams = useSearchParams();
  const initialCwd = searchParams.get('cwd');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedCwd, setSelectedCwd] = useState<string>(initialCwd || '');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data: { projects: Project[] }) => {
        setProjects(data.projects || []);
        if (!initialCwd && data.projects?.length) {
          setSelectedCwd(data.projects[0].path);
        }
      })
      .catch((err) => console.error('Failed to load projects:', err));
  }, [initialCwd]);

  const activeProject = projects.find((p) => p.path === selectedCwd);

  return (
    <div className="flex h-screen flex-col bg-[#07090E] font-sans text-ink-100 antialiased selection:bg-forge-500/30">
      {/* Top Header Navigation */}
      <TopBar
        projects={projects}
        selectedProjectId={activeProject?.id || null}
        onSelectProject={(id) => {
          const p = projects.find((x) => x.id === id);
          if (p) setSelectedCwd(p.path);
        }}
        onNewTask={() => {}}
        onOpenApiKeys={() => {}}
        runningCount={0}
        queuedCount={0}
        concurrencyLimit={10}
        activeTab="terminal"
      />

      {/* Main Terminal View Container */}
      <div className="flex-1 flex flex-col min-h-0 bg-black">
        {/* Sub-header directory selector */}
        <div className="flex shrink-0 items-center justify-between border-b border-ink-800 bg-ink-900/90 px-4 py-2 text-[12px]">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 font-bold">
              <TerminalIcon className="h-3.5 w-3.5" />
            </div>
            <span className="font-display font-semibold text-ink-100">Terminal Working Root:</span>
            <select
              value={selectedCwd}
              onChange={(e) => setSelectedCwd(e.target.value)}
              className="rounded border border-ink-700 bg-black px-2.5 py-1 text-[11px] font-mono text-emerald-400 outline-none focus:border-emerald-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.path}>
                  {p.name} ({p.path})
                </option>
              ))}
            </select>
          </div>

          <div className="text-[11px] text-ink-400 font-mono">
            Full Interactive Shell Access
          </div>
        </div>

        {/* Live Terminal */}
        <div className="flex-1 min-h-0">
          <TerminalView cwd={selectedCwd} projectName={activeProject?.name} />
        </div>
      </div>
    </div>
  );
}

export default function TerminalStudioPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-black text-emerald-400 font-mono text-[12px]">Loading Terminal Studio...</div>}>
      <TerminalStudioInner />
    </Suspense>
  );
}
