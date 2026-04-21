"use client";

import { CornerRightUp, FileText, Mic, Square } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";

interface AIInputProps {
  id?: string;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  onSubmit?: (value: string) => void;
  onStop?: () => void;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  contextBadge?: {
    label?: string;
    value: string;
  };
}

export function AIInput({
  id = "ai-input",
  placeholder = "Type your message...",
  minHeight = 52,
  maxHeight = 200,
  onSubmit,
  onStop,
  className,
  disabled = false,
  isLoading = false,
  contextBadge,
}: AIInputProps) {
  const hasContextBadge = Boolean(contextBadge?.value);
  const textareaMinHeight = hasContextBadge ? minHeight + 18 : minHeight;
  const textareaMaxHeight = hasContextBadge ? maxHeight + 18 : maxHeight;

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: textareaMinHeight,
    maxHeight: textareaMaxHeight,
  });
  const [inputValue, setInputValue] = useState("");

  const handleReset = () => {
    if (!inputValue.trim() || disabled) return;
    onSubmit?.(inputValue);
    setInputValue("");
    adjustHeight(true);
  };

  return (
    <div className={cn("w-full py-4", className)}>
      <div className="relative max-w-xl w-full mx-auto">
        {hasContextBadge && (
          <div
            className="absolute top-2.5 left-4 z-10 pointer-events-none"
            aria-label={contextBadge?.label ? `${contextBadge.label}: ${contextBadge.value}` : contextBadge?.value}
          >
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-2 py-0.5">
              <FileText className="w-3 h-3 text-black/60 dark:text-white/60" aria-hidden="true" />
              {contextBadge?.label && (
                <span className="text-[9px] uppercase tracking-wide font-semibold text-black/55 dark:text-white/55">
                  {contextBadge.label}
                </span>
              )}
              <span
                className="text-[11px] font-medium text-black/85 dark:text-white/85 max-w-[200px] truncate"
                title={contextBadge?.value}
              >
                {contextBadge?.value}
              </span>
            </div>
          </div>
        )}

        <Textarea
          id={id}
          placeholder={placeholder}
          className={cn(
            "max-w-xl bg-black/5 dark:bg-white/5 rounded-3xl pl-6 pr-16",
            "placeholder:text-black/50 dark:placeholder:text-white/50",
            "border-none ring-black/20 dark:ring-white/20",
            "text-black dark:text-white text-wrap",
            "overflow-y-auto resize-none",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "transition-[height] duration-100 ease-out",
            "leading-[1.25] pb-[14px]",
            hasContextBadge ? "pt-[34px]" : "pt-[16px]",
            "[&::-webkit-resizer]:hidden"
          )}
          style={{ minHeight: `${textareaMinHeight}px`, maxHeight: `${textareaMaxHeight}px` }}
          ref={textareaRef}
          value={inputValue}
          disabled={disabled || isLoading}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleReset();
            }
          }}
        />

        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-xl bg-black/5 dark:bg-white/5 py-1 px-1 transition-all duration-200",
            inputValue && !isLoading ? "right-10 opacity-100 scale-100" : "right-3 opacity-0 scale-95 pointer-events-none"
          )}
        >
          <Mic className="w-4 h-4 text-black/70 dark:text-white/70" />
        </div>

        {isLoading ? (
          <button
            onClick={onStop}
            type="button"
            className={cn(
              "absolute top-1/2 -translate-y-1/2 right-3",
              "rounded-xl bg-black/5 dark:bg-white/5 py-1 px-1",
              "transition-all duration-200",
              "opacity-100 scale-100"
            )}
            title="Stop generating"
          >
            <Square className="w-4 h-4 text-black/70 dark:text-white/70 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleReset}
            type="button"
            disabled={disabled}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 right-3",
              "rounded-xl bg-black/5 dark:bg-white/5 py-1 px-1",
              "transition-all duration-200",
              inputValue
                ? "opacity-100 scale-100 animate-fade-scale"
                : "opacity-0 scale-95 pointer-events-none"
            )}
          >
            <CornerRightUp className="w-4 h-4 text-black/70 dark:text-white/70" />
          </button>
        )}
      </div>
    </div>
  );
}
