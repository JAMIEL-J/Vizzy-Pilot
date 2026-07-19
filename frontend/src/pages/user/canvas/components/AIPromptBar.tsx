// AIPromptBar — memoized prompt input component, extracted from CanvasPage.tsx
import React, { useState } from 'react';
import { RotateCcw, Play, ChevronDown, ChevronUp, Sparkles, Minimize2 } from 'lucide-react';
import { VizzyPilotLogoIcon } from '../../../../components/layout/VizzyLogo';

interface AIPromptBarProps {
  onSubmit: (prompt: string) => void;
  isCompiling: boolean;
  suggestions?: string[];
  placeholder?: string;
  isFullScreen?: boolean;
  showSuggestions?: boolean;
}

const AIPromptBar: React.FC<AIPromptBarProps> = React.memo(({
  onSubmit,
  isCompiling,
  placeholder = "Prompt AI to construct and organize widgets on your canvas...",
  isFullScreen = false,
}) => {
  const [value, setValue] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isCompiling) return;
    onSubmit(value);
    setValue('');
  };

  if (isMinimized) {
    return (
      <div className={isFullScreen ? "flex justify-center w-full" : "flex justify-start w-full py-0.5"}>
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-2.5 bg-surface/95 border border-border-custom hover:border-accent-custom/80 rounded-full shadow-2xl transition-all cursor-pointer group hover:scale-110 active:scale-95 backdrop-blur-md flex items-center justify-center"
          title="Expand AI Prompt Bar"
          aria-label="Expand AI Prompt Bar"
        >
          <VizzyPilotLogoIcon size={20} className="text-accent-custom animate-pulse" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
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
              ? "w-[600px] max-w-[85vw] bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-xl py-3 pl-11 pr-40 text-xs font-mono shadow-inner focus:outline-none transition-all placeholder:text-muted-custom"
              : "w-full bg-surface border border-border-custom hover:border-border-custom/80 focus:border-accent-custom/50 rounded-2xl py-3.5 pl-11 pr-40 text-xs font-mono shadow-xs focus:outline-none transition-all placeholder:text-muted-custom"
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
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="p-1.5 text-muted-custom hover:text-text-custom hover:bg-surface-2/60 rounded-lg transition-colors cursor-pointer"
            title="Minimize prompt bar"
            aria-label="Minimize prompt bar"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
});

export default AIPromptBar;

