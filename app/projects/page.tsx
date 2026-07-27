'use client';

import {
  Folder,
  FolderGit2,
  GitBranch,
  GitCommit,
  GitMerge,
  Globe,
  Plus,
  RefreshCcw,
  Sparkles,
  Terminal,
  Trash2,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { FolderBrowser } from '@/app/components/FolderBrowser';
import { TopBar } from '@/app/components/TopBar';
import { type Project } from '@/lib/types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBrowser, setShowBrowser] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
  }, []);

  const handleRegisterProject = async (path: string) => {
    setShowBrowser(false);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (res.ok) {
        await fetchProjects();
      }
    } catch (err) {
      console.error('Failed to register project:', err);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to unregister this project? Local repository files will NOT be deleted.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#07090E] font-sans text-ink-100 antialiased selection:bg-forge-500/30">
      {/* Top Header Navigation */}
      <TopBar
        projects={projects}
        selectedProjectId={selectedPath}
        onSelectProject={(id) => {
          const p = projects.find((x) => x.id === id);
          if (p) setSelectedPath(p.id);
        }}
        onNewTask={() => {}}
        onOpenApiKeys={() => {}}
        runningCount={0}
        queuedCount={0}
        concurrencyLimit={10}
        activeTab="projects"
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Title Header */}
        <div className="flex items-center justify-between border-b border-ink-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-forge-500/30 to-amber-500/10 border border-forge-500/40 text-forge-400">
                <FolderGit2 className="h-4 w-4" />
              </div>
              <h1 className="font-display text-[20px] font-bold tracking-tight text-ink-50">
                Projects Vault & Repositories
              </h1>
            </div>
            <p className="mt-1 text-[12px] text-ink-400">
              Manage registered local repositories, branch configurations, and agent workspaces
            </p>
          </div>

          <button
            onClick={() => setShowBrowser(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-forge-500 to-amber-500 px-4 py-2 text-[12px] font-semibold text-ink-900 shadow-lg shadow-forge-500/20 hover:brightness-110 transition"
          >
            <Plus className="h-4 w-4" />
            Add Local / Remote Project
          </button>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="flex h-64 items-center justify-center text-[12px] text-ink-500 animate-pulse">
            Loading repositories...
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-800 bg-ink-900/50 p-12 text-center">
            <FolderGit2 className="h-12 w-12 text-ink-600 mb-3" />
            <h3 className="font-display text-[15px] font-semibold text-ink-200">No Projects Registered Yet</h3>
            <p className="mt-1 text-[12px] text-ink-400 max-w-md">
              Register a local Git repository path or GitHub URL to start executing multi-agent tasks
            </p>
            <button
              onClick={() => setShowBrowser(true)}
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-forge-500 px-4 py-2 text-[12px] font-semibold text-ink-900 hover:bg-forge-400 transition"
            >
              <Plus className="h-4 w-4" />
              Add First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group relative flex flex-col rounded-xl border border-ink-800/90 bg-gradient-to-b from-ink-850/90 to-ink-900/90 p-4 shadow-xl backdrop-blur-sm transition-all hover:border-forge-500/40 hover:shadow-forge-500/5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-800 border border-ink-700 text-forge-400 group-hover:border-forge-500/40 transition">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-display text-[14px] font-semibold text-ink-100">{project.name}</h3>
                      <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono mt-0.5">
                        <GitBranch className="h-3 w-3" />
                        <span>{project.base_branch || 'main'}</span>
                        <ShieldCheck className="h-3 w-3 text-emerald-400 ml-1" />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteProject(project.id)}
                    disabled={busyId === project.id}
                    className="rounded p-1 text-ink-500 hover:bg-red-500/10 hover:text-red-400 transition"
                    title="Remove project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Path info */}
                <div className="mt-3 rounded bg-black/40 p-2.5 border border-ink-800/80 font-mono text-[11px] text-ink-300 break-all">
                  {project.path}
                </div>

                {/* Actions Bar */}
                <div className="mt-4 pt-3 border-t border-ink-800/60 flex items-center justify-between text-[11px]">
                  <Link
                    href={`/?project=${project.id}`}
                    className="flex items-center gap-1 font-semibold text-forge-400 hover:text-forge-300 transition"
                  >
                    <span>Launch Command Hub</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>

                  <Link
                    href={`/terminal?cwd=${encodeURIComponent(project.path)}`}
                    className="flex items-center gap-1 text-ink-400 hover:text-emerald-400 transition font-mono"
                  >
                    <Terminal className="h-3 w-3" />
                    <span>Terminal</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder Browser Modal */}
      {showBrowser && (
        <FolderBrowser
          onSelect={handleRegisterProject}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
