import { exec } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { getConfig, updateConfig } from './config.ts';

const execAsync = promisify(exec);

export type BinaryStatus = {
  name: string;
  installed: boolean;
  path: string;
  version?: string;
};

export async function checkBinaries(): Promise<BinaryStatus[]> {
  const config = getConfig();

  const checkSingle = async (name: string, currentPath: string, versionCmd: string): Promise<BinaryStatus> => {
    if (currentPath && fs.existsSync(currentPath)) {
      try {
        const { stdout } = await execAsync(`"${currentPath}" ${versionCmd}`);
        return { name, installed: true, path: currentPath, version: stdout.trim().slice(0, 30) };
      } catch {
        return { name, installed: true, path: currentPath };
      }
    }

    try {
      const { stdout } = await execAsync(`which ${name}`);
      const foundPath = stdout.trim();
      if (foundPath && fs.existsSync(foundPath)) {
        return { name, installed: true, path: foundPath };
      }
    } catch {
      // not found
    }

    return { name, installed: false, path: '' };
  };

  const results = await Promise.all([
    checkSingle('antigravity', config.antigravityBinPath, '--version'),
    checkSingle('codex', config.codexBinPath, '--version'),
    checkSingle('claude', config.claudeBinPath, '--version'),
  ]);

  return results;
}

export async function autoInstallBinary(name: 'codex' | 'claude' | 'antigravity'): Promise<{ ok: boolean; path?: string; message: string }> {
  try {
    if (name === 'codex') {
      await execAsync('npm install -g @openai/codex');
      const { stdout } = await execAsync('which codex');
      const binPath = stdout.trim();
      if (binPath) {
        updateConfig({ codexBinPath: binPath });
        return { ok: true, path: binPath, message: 'Codex CLI installed successfully!' };
      }
    } else if (name === 'claude') {
      await execAsync('npm install -g @anthropic-ai/claude-code');
      const { stdout } = await execAsync('which claude');
      const binPath = stdout.trim();
      if (binPath) {
        updateConfig({ claudeBinPath: binPath });
        return { ok: true, path: binPath, message: 'Claude Code CLI installed successfully!' };
      }
    } else if (name === 'antigravity') {
      // Try local bin agy path or install script
      const homeAgy = path.join(os.homedir(), '.local', 'bin', 'agy');
      if (fs.existsSync(homeAgy)) {
        updateConfig({ antigravityBinPath: homeAgy });
        return { ok: true, path: homeAgy, message: 'Antigravity CLI detected at ' + homeAgy };
      }
      return { ok: false, message: 'Antigravity CLI (agy) is managed natively by Google DeepMind script.' };
    }
  } catch (err) {
    return { ok: false, message: (err as Error).message || `Failed to install ${name}` };
  }

  return { ok: false, message: `Unknown binary ${name}` };
}
