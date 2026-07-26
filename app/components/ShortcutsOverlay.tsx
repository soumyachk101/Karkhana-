'use client';

import { Kbd, Modal } from './ui/primitives.tsx';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'Global',
    items: [
      [['⌘', 'K'], 'Command palette — jump to any task, project, or action'],
      [['N'], 'New task'],
      [['⌘', 'B'], 'Collapse or expand the sidebar'],
      [['/'], 'Focus the board search'],
      [['T'], 'Toggle light and dark theme'],
      [['?'], 'This help'],
      [['Esc'], 'Close whatever is open'],
    ],
  },
  {
    title: 'Board',
    items: [
      [['B'], 'Board layout'],
      [['L'], 'List layout'],
      [['↵'], 'Open the highlighted task from the palette'],
    ],
  },
  {
    title: 'Task detail',
    items: [
      [['1'], 'Split view'],
      [['2'], 'Conversation only'],
      [['3'], 'Terminal only'],
      [['4'], 'Diff only'],
      [['⌘', '↵'], 'Send a follow-up while the composer is open'],
    ],
  },
  {
    title: 'Terminal',
    items: [
      [['↑', '↓'], 'Command history'],
      [['Ctrl', 'L'], 'Clear the view (stored history is untouched)'],
      [['↵'], 'Run in the task worktree'],
    ],
  },
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" icon="keyboard" onClose={onClose} width="w-[620px]">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[10px] uppercase tracking-wider text-ink-400">{group.title}</h3>
            <ul className="space-y-1.5">
              {group.items.map(([keys, description]) => (
                <li key={description} className="flex items-start gap-2">
                  <span className="flex shrink-0 items-center gap-0.5">
                    {keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                  <span className="text-[11.5px] leading-snug text-ink-300">{description}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
