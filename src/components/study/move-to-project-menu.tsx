"use client";

import * as React from "react";
import { Check, Folder, FolderInput, FolderMinus } from "lucide-react";
import {
  DropdownItem,
  DropdownSeparator,
  DropdownSub,
  DropdownSubContent,
  DropdownSubTrigger,
} from "@/components/ui/dropdown";

export type ProjectOption = { id: string; name: string };

/**
 * ChatGPT's "Move to project ▸" submenu — shared between the sidebar
 * chat rows and the chat header's ⋯ menu. Renders nothing when the
 * learner has no projects (an empty submenu is worse than absence).
 * The current project shows a check and is inert; project chats get a
 * "Remove from project" escape hatch at the bottom.
 */
export function MoveToProjectMenu({
  projects,
  currentProjectId,
  disabled,
  onMove,
}: {
  projects: ProjectOption[];
  currentProjectId: string | null;
  disabled: boolean;
  onMove: (projectId: string | null) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <DropdownSub>
      <DropdownSubTrigger disabled={disabled}>
        <FolderInput className="size-4 text-fg-tertiary" />
        Move to project
      </DropdownSubTrigger>
      <DropdownSubContent className="max-w-64">
        {projects.map((project) => {
          const current = project.id === currentProjectId;
          return (
            <DropdownItem
              key={project.id}
              disabled={disabled || current}
              onSelect={() => onMove(project.id)}
            >
              <Folder className="size-4 shrink-0 text-fg-tertiary" />
              <span className="truncate">{project.name}</span>
              {current && (
                <Check className="ml-auto size-4 shrink-0 text-fg-tertiary" />
              )}
            </DropdownItem>
          );
        })}
        {currentProjectId && (
          <>
            <DropdownSeparator />
            <DropdownItem
              disabled={disabled}
              onSelect={() => onMove(null)}
            >
              <FolderMinus className="size-4 text-fg-tertiary" />
              Remove from project
            </DropdownItem>
          </>
        )}
      </DropdownSubContent>
    </DropdownSub>
  );
}
