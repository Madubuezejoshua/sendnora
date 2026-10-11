'use client';

import * as React from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface CommandPaletteItem {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandPaletteItem[];
  placeholder?: string;
}

/**
 * Global search/command palette (Cmd/Ctrl+K). The consuming app is
 * responsible for wiring the keyboard shortcut to `onOpenChange` and for
 * building the `items` list (recent invoices, quick-create actions, nav).
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  placeholder = 'Search or jump to...',
}: CommandPaletteProps) {
  const groups = React.useMemo(() => {
    const map = new Map<string, CommandPaletteItem[]>();
    for (const item of items) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className={cn(
        'fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg',
        'border-border bg-popover text-popover-foreground shadow-popover border',
      )}
    >
      <div className="border-border flex items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-4" />
        <Command.Input
          placeholder={placeholder}
          className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-sm outline-none"
        />
      </div>
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="text-muted-foreground py-6 text-center text-sm">
          No results found.
        </Command.Empty>
        {groups.map(([group, groupItems]) => (
          <Command.Group
            key={group}
            heading={group}
            className="text-muted-foreground px-2 py-1 text-xs font-medium"
          >
            {groupItems.map((item) => (
              <Command.Item
                key={item.id}
                onSelect={() => {
                  item.onSelect();
                  onOpenChange(false);
                }}
                className={cn(
                  'text-foreground flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm',
                  'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground',
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <kbd className="text-muted-foreground text-xs">{item.shortcut}</kbd>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
