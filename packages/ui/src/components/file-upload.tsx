'use client';

import * as React from 'react';
import { UploadCloud, File as FileIcon, X } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface FileUploadProps {
  accept?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  files?: File[];
  onRemove?: (file: File) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  accept,
  maxSizeBytes,
  multiple = false,
  onFilesSelected,
  files = [],
  onRemove,
  hint,
  disabled,
  className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const selected = Array.from(fileList);
    if (maxSizeBytes) {
      const tooLarge = selected.find((f) => f.size > maxSizeBytes);
      if (tooLarge) {
        setError(
          `"${tooLarge.name}" exceeds the ${Math.round(maxSizeBytes / 1024 / 1024)}MB limit.`,
        );
        return;
      }
    }
    setError(null);
    onFilesSelected(selected);
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed',
          'border-border px-6 py-10 text-center transition-colors focus-visible:outline-none',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2',
          isDragging && 'border-primary bg-primary/5',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <UploadCloud className="text-muted-foreground size-8" aria-hidden="true" />
        <p className="text-sm font-medium">Click to upload or drag and drop</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p role="alert" className="text-destructive mt-2 text-xs font-medium">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file) => (
            <li
              key={file.name + file.size}
              className="border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <FileIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate">{file.name}</span>
              </span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(file)}
                  aria-label={`Remove ${file.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
