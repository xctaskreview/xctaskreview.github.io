import { useRef, useState, type DragEvent, type ReactNode } from 'react';

function fileMatchesAccept(file: File, accept: string[]): boolean {
  const lower = file.name.toLowerCase();
  return accept.some((ext) => lower.endsWith(ext.toLowerCase()));
}

interface FileDropZoneProps {
  accept: string[];
  disabled?: boolean;
  multiple?: boolean;
  className?: string;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

export function FileDropZone({
  accept,
  disabled = false,
  multiple = false,
  className = '',
  onFiles,
  children,
}: FileDropZoneProps) {
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragCounter.current += 1;
    setDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    if (disabled) return;

    const matched = Array.from(event.dataTransfer.files).filter((file) => fileMatchesAccept(file, accept));
    if (matched.length === 0) return;

    onFiles(multiple ? matched : [matched[0]]);
  };

  const classes = ['file-drop-zone', dragOver ? 'drag-over' : '', disabled ? 'disabled' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
}
