"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MonitorIcon,
  Code2,
  Layers,
  Rocket,
  ChevronDown,
  Database,
} from "lucide-react";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";


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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center rounded-xl overflow-hidden bg-[radial-gradient(125%_125%_at_50%_101%,rgba(255,140,60,0.65)_10.5%,rgba(255,180,100,0.5)_20%,rgba(250,210,225,0.7)_40%,rgba(225,235,250,0.9)_70%,rgba(255,255,255,1)_100%)] dark:bg-[radial-gradient(125%_125%_at_50%_101%,rgba(245,87,2,1)_10.5%,rgba(245,120,2,1)_16%,rgba(245,140,2,1)_17.5%,rgba(245,170,100,1)_25%,rgba(238,174,202,1)_40%,rgba(202,179,214,1)_65%,rgba(148,201,233,1)_100%)]">
      
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
            <div className="flex items-center bg-black/10 dark:bg-black/25 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl p-1.5 shadow-lg relative z-50 transition-all hover:border-white/30 dark:hover:border-white/20" ref={dropdownRef}>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-700 dark:text-white/70 font-semibold bg-white/30 dark:bg-white/10 px-3.5 py-1.5 rounded-xl mr-2">
                <Database className="w-3.5 h-3.5 text-neutral-800 dark:text-white/80" />
                Dataset
              </span>
              <button
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="flex items-center justify-between gap-3 px-4 py-1.5 bg-black/5 dark:bg-black/45 border border-white/15 dark:border-white/10 rounded-xl text-sm font-medium text-neutral-900 dark:text-white focus:outline-none min-w-[240px] transition-all hover:bg-black/10 dark:hover:bg-black/60 hover:scale-[1.01] hover:border-white/25 dark:hover:border-white/20 active:scale-[0.99]"
              >
                <span className="truncate max-w-[200px] text-left">
                  {selectedDatasetId
                    ? datasets.find((d) => d.id === selectedDatasetId)?.name
                    : "Select a dataset..."}
                </span>
                <ChevronDown className={cn("w-4 h-4 text-neutral-500 dark:text-neutral-400 transition-transform", isDropdownOpen && "rotate-180")} />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-[calc(100%+8px)] left-0 mt-0 w-full min-w-[300px] max-h-[300px] overflow-y-auto bg-white/95 dark:bg-[#1C1C1F]/95 backdrop-blur-xl border border-neutral-200 dark:border-white/10 rounded-xl shadow-2xl z-50 flex flex-col py-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      onDatasetChange("");
                      setIsDropdownOpen(false);
                    }}
                    className={cn(
                      "px-4 py-2.5 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10 mx-1.5 rounded-lg",
                      selectedDatasetId === ""
                        ? "bg-black/5 dark:bg-white/10 text-neutral-900 dark:text-white font-semibold border-l-2 border-primary"
                        : "text-neutral-700 dark:text-white/60"
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
                        "px-4 py-2.5 text-left text-sm transition-all hover:bg-black/5 dark:hover:bg-white/10 mx-1.5 rounded-lg truncate",
                        selectedDatasetId === ds.id
                          ? "bg-black/5 dark:bg-white/10 text-neutral-900 dark:text-white font-semibold border-l-2 border-primary"
                          : "text-neutral-700 dark:text-white/60"
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

        <div className="w-full">
          <PromptInputBox 
            onSend={(msg) => onSendMessage?.(msg)}
            placeholder="Ask about revenue, trends, or specific metrics..."
            disabled={!selectedDatasetId}
          />
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
