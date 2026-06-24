import React from 'react';
import { RefreshCw, Share2, Download, MoreVertical } from 'lucide-react';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

const ChartCard = ({ title, children, className, actions }: ChartCardProps) => (
  <div className={`bg-bg-card border border-border-main rounded-2xl p-6 shadow-sm h-full flex flex-col ${className || ''}`}>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 flex-shrink-0 w-full">
      <h4 className="text-sm font-sans font-bold text-themed-main leading-snug">{title}</h4>
      
      {actions ? (
        <div className="relative z-10 flex gap-2 items-center justify-end">{actions}</div>
      ) : (
        <div className="flex gap-1.5 relative z-10 justify-end">
          <button 
            className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors border-none bg-transparent cursor-pointer text-themed-muted hover:text-themed-main" 
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button 
            className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors border-none bg-transparent cursor-pointer text-themed-muted hover:text-themed-main" 
            title="Share"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button 
            className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors border-none bg-transparent cursor-pointer text-themed-muted hover:text-themed-main" 
            title="Download Data"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button 
            className="p-1.5 hover:bg-surface-2 rounded-lg transition-colors border-none bg-transparent cursor-pointer text-themed-muted hover:text-themed-main" 
            title="More"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>

    <div className="flex-1 min-h-0 w-full flex flex-col justify-end">
      {children}
    </div>
  </div>
);

export default ChartCard;
