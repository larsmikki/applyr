import { useState, useRef, useCallback } from 'react';
import { Upload, File, X } from 'lucide-react';

interface Props {
  accept?: string;
  onFile: (file: File) => void;
  label?: string;
  selectedFile?: File | null;
  onClear?: () => void;
}

export default function FileDropzone({ accept, onFile, label = 'Drop a file or click to browse', selectedFile, onClear }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  if (selectedFile) {
    return (
      <div className="border-2 border-accent dark:border-accent rounded-xl p-4 bg-accent/10 dark:bg-accent/20 flex items-center gap-3">
        <File className="w-5 h-5 text-accent dark:text-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{selectedFile.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1 rounded-lg hover:bg-accent dark:hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
      </div>
    );
  }

  const openPicker = () => inputRef.current?.click();
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:ring-offset-2 ${
        isDragging
          ? 'border-accent bg-accent/10 dark:bg-accent/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-accent dark:hover:border-accent hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        tabIndex={-1}
      />
      <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-accent' : 'text-gray-400'}`} aria-hidden="true" />
      <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {accept ? `Accepted: ${accept}` : 'Any file type'}
      </p>
    </div>
  );
}
