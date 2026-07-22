// useCanvasExport — PNG/SVG/JSON export, presentation mode — extracted from CanvasPage.tsx
import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import type { CanvasWidget, HistoryFrame } from '../types';

function triggerDownload(content: string | Blob, filename: string) {
  const link = document.createElement('a');
  if (typeof content === 'string') {
    link.href = content;
  } else {
    link.href = URL.createObjectURL(content);
  }
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (typeof content !== 'string') {
    URL.revokeObjectURL(link.href);
  }
}

interface UseCanvasExportParams {
  widgets: CanvasWidget[];
  past: HistoryFrame[];
  future: HistoryFrame[];
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  addLog: (msg: string) => void;
}

interface UseCanvasExportReturn {
  isExporting: boolean;
  isPresentMode: boolean;
  setIsPresentMode: (v: boolean) => void;
  isFullScreenCanvas: boolean;
  setIsFullScreenCanvas: (v: boolean) => void;
  isResponsive: boolean;
  handleExportVisuals: (format?: 'png' | 'svg' | 'json') => Promise<void>;
}

export function useCanvasExport(params: UseCanvasExportParams): UseCanvasExportReturn {
  const { widgets, past, future, canvasContainerRef, addLog } = params;

  const [isExporting, setIsExporting] = useState(false);
  const [isPresentMode, setIsPresentMode] = useState(false);
  const [isFullScreenCanvas, setIsFullScreenCanvas] = useState(false);

  const isResponsive = false;

  const handleExportVisuals = useCallback(async (format: 'png' | 'svg' | 'json' = 'png') => {
    if (!canvasContainerRef.current) return;
    toast.loading(`Exporting canvas as ${format.toUpperCase()}...`, { id: 'export-toast' });
    
    setTimeout(async () => {
      if (format === 'json') {
        const config = { widgets, past, future };
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        triggerDownload(blob, 'vizzy-canvas-export.json');
        toast.success("Canvas exported successfully as JSON!", { id: 'export-toast' });
        addLog("Export success! Canvas saved as JSON config.");
        return;
      }

      const htmlToImage = await import('html-to-image');

      setIsExporting(true);
      setTimeout(() => {
        const element = canvasContainerRef.current as HTMLElement;
        
        const exportWidth = element.scrollWidth;
        const exportHeight = Math.max(element.scrollHeight, 800);

        const isDark = document.documentElement.classList.contains('dark');
        const options = { 
          backgroundColor: isDark ? '#111111' : '#ffffff',
          pixelRatio: 2,
          width: exportWidth,
          height: exportHeight,
          style: {
            transform: 'none'
          }
        };

        const promise = format === 'svg' 
          ? htmlToImage.toSvg(element, options)
          : htmlToImage.toPng(element, options);

        promise
        .then((dataUrl) => {
          let finalUrl = dataUrl;
          if (format === 'svg') {
            const parts = dataUrl.split(',');
            if (parts.length > 1) {
              finalUrl = parts[0] + ',' + encodeURIComponent(decodeURIComponent(parts[1]));
            }
          }
          triggerDownload(finalUrl, `vizzy-canvas-export.${format}`);
          toast.success(`Canvas exported successfully as ${format.toUpperCase()}!`, { id: 'export-toast' });
          addLog(`Export success! Canvas saved as high-res ${format.toUpperCase()}.`);
        })
        .catch((error) => {
          console.error('Error exporting canvas:', error);
          toast.error("Failed to export canvas.", { id: 'export-toast' });
          addLog("Export failed.");
        })
        .finally(() => {
          setIsExporting(false);
        });
      }, 300);
    }, 100);
  }, [widgets, past, future, canvasContainerRef, addLog]);

  return {
    isExporting, isPresentMode, setIsPresentMode,
    isFullScreenCanvas, setIsFullScreenCanvas,
    isResponsive, handleExportVisuals
  };
}
