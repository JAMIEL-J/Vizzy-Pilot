// AIPromptBar — memoized prompt input component, extracted from CanvasPage.tsx
import React, { useState } from 'react';
import { RotateCcw, Play } from 'lucide-react';
import { VizzyPilotLogoIcon } from '../../../../components/layout/VizzyLogo';

interface AIPromptBarProps {
  onSubmit: (prompt: string) => void;
  isCompiling: boolean;
  suggestions: string[];
  placeholder?: string;
  isFullScreen?: boolean;
  showSuggestions?: boolean;
}

const AIPromptBar: React.FC<AIPromptBarProps> = React.memo(({
  onSubmit,
  isCompiling,
  suggestions,
  placeholder = "Prompt AI to construct and organize widgets on your canvas...",
  isFullScreen = false,
  showSuggestions = true
}) => {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isCompiling) return;
    onSubmit(value);
    setValue('');
  };

  return (
    <div className="space-y-4 w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <VizzyPilotLogoIcon size={18} className="text-accent-custom animate-pulse" />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={
            isFullScreen
              ? "w-full bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-xl py-3 pl-11 pr-32 text-xs font-mono shadow-inner focus:outline-none transition-all placeholder:text-muted-custom"
              : "w-full bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-2xl py-3.5 pl-11 pr-32 text-xs font-mono shadow-xs focus:outline-none transition-all placeholder:text-muted-custom"
          }
          disabled={isCompiling}
        />
        <div className={isFullScreen ? "absolute right-2 inset-y-1.5 flex items-center space-x-1.5" : "absolute right-2.5 inset-y-2 flex items-center space-x-1.5"}>
          {value && (
            <button 
              type="button" 
              onClick={() => setValue('')}
              className="text-[10px] font-mono text-muted-custom hover:text-text-custom px-1 cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={isCompiling}
            className={
              isFullScreen
                ? "px-3 h-full bg-accent-custom hover:opacity-90 disabled:opacity-50 text-white text-[11px] font-mono font-medium rounded-lg flex items-center space-x-1 cursor-pointer transition-all shadow-xs"
                : "px-4 h-full bg-accent-custom hover:opacity-90 disabled:opacity-50 text-white text-xs font-mono font-medium rounded-xl flex items-center space-x-1 cursor-pointer transition-all shadow-xs"
            }
          >
            {isCompiling ? (
              <>
                <RotateCcw className={isFullScreen ? "w-3.5 h-3.5 animate-spin" : "w-3 h-3 animate-spin"} />
                <span>Compiling...</span>
              </>
            ) : (
              <>
                <Play className={isFullScreen ? "w-3.5 h-3.5 fill-current" : "w-3 h-3 fill-current"} />
                <span>Compile</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Suggestion pills */}
      {showSuggestions && (
        <div className="flex flex-wrap items-center gap-2">
          {!isFullScreen && <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-custom">AI Templates:</span>}
          {suggestions.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setValue(sug)}
              className={
                isFullScreen
                  ? "px-2 py-1 bg-surface-2 hover:bg-border-custom/20 border border-border-custom/30 rounded-full text-[9px] font-mono text-muted-custom hover:text-text-custom transition-all cursor-pointer truncate max-w-[200px]"
                  : "px-2.5 py-1 bg-surface hover:bg-border-custom/20 border border-border-custom rounded-full text-[9px] font-mono text-muted-custom hover:text-text-custom transition-all cursor-pointer truncate max-w-[240px]"
              }
            >
              {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default AIPromptBar;
