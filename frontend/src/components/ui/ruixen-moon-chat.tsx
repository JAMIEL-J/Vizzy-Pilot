"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MonitorIcon,
  ArrowUpIcon,
  Code2,
  Layers,
  Rocket,
  ChevronDown,
} from "lucide-react";

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`; // reset first
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Infinity)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
}

interface RuixenMoonChatProps {
  onSendMessage?: (msg: string) => void;
  datasets?: { id: string; name: string }[];
  selectedDatasetId?: string;
  onDatasetChange?: (id: string) => void;
}

export default function RuixenMoonChat({
  onSendMessage,
  datasets = [],
  selectedDatasetId = "",
  onDatasetChange,
}: RuixenMoonChatProps) {
  const [message, setMessage] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 48,
    maxHeight: 150,
  });

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleSend = () => {
    if (message.trim() && onSendMessage) {
      onSendMessage(message.trim());
      setMessage("");
      adjustHeight(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center rounded-xl overflow-hidden bg-white dark:bg-black">
      {/* Dynamic Theme Background Image */}
      <div
        className="absolute inset-0 z-0 transition-all duration-700 invert hue-rotate-180 opacity-60 dark:invert-0 dark:hue-rotate-0 dark:opacity-100"
        style={{
          backgroundImage: "url('https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/ruixen_moon_2.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      />
      <div className="absolute inset-0 bg-white/20 dark:bg-black/40 z-0"></div>
      
      {/* Centered AI Title */}
      <div className="flex flex-col items-center justify-center z-10 mb-8 mt-[-10vh]">
        <div className="text-center">
          <h1 className="text-5xl font-semibold text-neutral-800 dark:text-white drop-shadow-sm dark:drop-shadow-lg tracking-tight mb-2">
            Vizzy AI
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-200 text-lg">
            What insights do you want to explore today?
          </p>
        </div>
      </div>

      {/* Input Box Section */}
      <div className="w-full max-w-3xl z-10 px-4">
        {datasets.length > 0 && onDatasetChange && (
          <div className="mb-6 flex items-center justify-center">
            <div className="flex items-center bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-full p-1 shadow-lg relative z-50" ref={dropdownRef}>
              <span className="text-xs uppercase tracking-widest text-neutral-700 dark:text-neutral-300 font-bold bg-white/50 dark:bg-white/10 px-4 py-2 rounded-full mr-2">
                Dataset
              </span>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="flex items-center justify-between gap-3 px-4 py-2 bg-white/80 dark:bg-[#111116] border border-transparent dark:border-white/5 rounded-full text-sm font-medium text-neutral-800 dark:text-gray-200 focus:outline-none min-w-[260px] transition-all hover:bg-white/100 dark:hover:bg-[#1a1a21]"
              >
                <span className="truncate max-w-[200px] text-left">
                  {selectedDatasetId
                    ? datasets.find((d) => d.id === selectedDatasetId)?.name
                    : "Select a dataset..."}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-neutral-500 dark:text-neutral-400 transition-transform", isDropdownOpen && "rotate-180")} />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-[calc(100%+8px)] left-0 mt-0 w-full min-w-[300px] max-h-[300px] overflow-y-auto bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl z-50 flex flex-col py-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      onDatasetChange("");
                      setIsDropdownOpen(false);
                    }}
                    className={cn(
                      "px-4 py-2.5 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/80 mx-1.5 rounded-md",
                      selectedDatasetId === ""
                        ? "bg-blue-100 dark:bg-[#9ec8ff] text-blue-800 dark:text-black font-semibold"
                        : "text-neutral-700 dark:text-neutral-300"
                    )}
                  >
                    Select a dataset...
                  </button>
                  {datasets.map((ds) => (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => {
                        onDatasetChange(ds.id);
                        setIsDropdownOpen(false);
                      }}
                      className={cn(
                        "px-4 py-2.5 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/80 mx-1.5 rounded-md truncate",
                        selectedDatasetId === ds.id
                          ? "bg-blue-100 dark:bg-[#9ec8ff] text-blue-800 dark:text-black font-semibold"
                          : "text-neutral-700 dark:text-neutral-300"
                      )}
                    >
                      {ds.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="relative bg-white/60 dark:bg-black/60 backdrop-blur-xl rounded-2xl border border-neutral-200 dark:border-neutral-700/60 shadow-2xl flex items-center p-2 gap-2">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about revenue, trends, or specific metrics..."
            className={cn(
              "flex-1 px-4 py-3 resize-none border-none",
              "bg-transparent text-black dark:text-white text-base",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "placeholder:text-neutral-500 dark:placeholder:text-neutral-400 min-h-[48px]"
            )}
            style={{ overflow: "hidden" }}
          />

          <Button
            onClick={handleSend}
            disabled={!message.trim() || !selectedDatasetId}
            className={cn(
              "flex-shrink-0 flex items-center justify-center p-3 h-10 w-10 sm:h-12 sm:w-12 rounded-xl transition-all font-medium",
              message.trim() && selectedDatasetId
                ? "bg-primary text-white hover:bg-primary/90" 
                : "bg-neutral-200 dark:bg-neutral-700/50 text-neutral-400 cursor-not-allowed border-none shadow-none"
            )}
            variant="ghost"
          >
            <ArrowUpIcon className="w-5 h-5" />
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-center flex-wrap gap-3 mt-8">
          <QuickAction 
            icon={<Code2 className="w-4 h-4" />} 
            label="Sales Summary"
            onClick={() => {
              if (onSendMessage) onSendMessage("What is the total sales?");
            }} 
          />
          <QuickAction 
            icon={<Rocket className="w-4 h-4" />} 
            label="Revenue by Region" 
            onClick={() => {
              if (onSendMessage) onSendMessage("Show me revenue by region");
            }} 
          />
          <QuickAction 
            icon={<Layers className="w-4 h-4" />} 
            label="Top Customers" 
            onClick={() => {
              if (onSendMessage) onSendMessage("Who are the top 5 customers?");
            }} 
          />
          <QuickAction 
            icon={<MonitorIcon className="w-4 h-4" />} 
            label="Recent Trends" 
            onClick={() => {
              if (onSendMessage) onSendMessage("Show me sales trends over time");
            }} 
          />
        </div>
      </div>
    </div>
  );
}

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function QuickAction({ icon, label, onClick }: QuickActionProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border-neutral-300 dark:border-neutral-600 bg-white/60 dark:bg-black/40 backdrop-blur-md text-neutral-800 dark:text-neutral-200 hover:text-primary dark:hover:text-white hover:bg-white/80 dark:hover:bg-black/70 transition-all font-medium tracking-wide shadow-sm"
    >
      {icon}
      <span className="text-sm">{label}</span>
    </Button>
  );
}
