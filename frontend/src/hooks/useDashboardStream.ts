import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const buildSseUrl = (versionId: string): string => {
  const base = API_URL.replace(/\/$/, '');
  return `${base}/dashboard/load/${versionId}`;
};

export interface ChartResult {
  chart_id?: string;
  kpi_id?: string;
  data: any;
  execution_slot: 'duckdb' | 'pandas';
  event?: 'done';
  error?: string;
}

import { useFilterStore } from '../store/useFilterStore';

export function useDashboardStream(versionId: string) {
  const resetStreamState = useFilterStore((state) => state.resetStreamState);
  const setStreamedData = useFilterStore((state) => state.setStreamedData);
  const streamedCharts = useFilterStore((state) => state.streamedCharts);
  const streamedKpis = useFilterStore((state) => state.streamedKpis);
  const streamDone = useFilterStore((state) => state.streamDone);
  const streamError = useFilterStore((state) => state.streamError);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    // Reset stream states in store on load / version change
    resetStreamState();

    if (!versionId) return;

    let es: EventSource | null = null;
    const receivedCharts = new Set<string>();
    const tempCharts: Record<string, ChartResult> = {};
    const tempKpis: Record<string, ChartResult> = {};

    const connect = () => {
      es = new EventSource(buildSseUrl(versionId), { withCredentials: true });

      es.onmessage = (event) => {
        try {
          const result: ChartResult = JSON.parse(event.data);

          if (result.event === 'done') {
            setStreamedData({ ...tempCharts }, { ...tempKpis }, true, null);
            es?.close();
            retryCountRef.current = 0;
            return;
          }

          if (result.error) {
            setStreamedData(null, null, false, result.error);
            es?.close();
            return;
          }

          const id = result.chart_id || result.kpi_id;
          if (id && !receivedCharts.has(id)) {
            receivedCharts.add(id);
            if (result.chart_id) {
              tempCharts[result.chart_id] = result;
            } else if (result.kpi_id) {
              tempKpis[result.kpi_id] = result;
            }
          }
        } catch (e) {
          console.error('Error parsing SSE message:', e);
        }
      };

      es.onerror = () => {
        if (es) es.close();
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          setTimeout(connect, 1000 * retryCountRef.current);
        } else {
          setStreamedData(null, null, false, 'Connection to dashboard stream lost after multiple retries.');
        }
      };
    };

    connect();

    return () => {
      if (es) es.close();
    };
  }, [versionId, resetStreamState, setStreamedData]);

  return {
    charts: streamedCharts || {},
    kpis: streamedKpis || {},
    done: streamDone,
    error: streamError
  };
}
