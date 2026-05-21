import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const buildSseUrl = (versionId: string): string => {
  const base = API_URL.replace(/\/$/, '');
  const url = new URL(`${base}/dashboard/load/${versionId}`);
  const token = localStorage.getItem('access_token');

  // EventSource cannot set custom headers, so pass token via query param.
  if (token) url.searchParams.set('access_token', token);

  return url.toString();
};

export interface ChartResult {
  chart_id?: string;
  kpi_id?: string;
  data: any;
  execution_slot: 'duckdb' | 'pandas';
  event?: 'done';
  error?: string;
}

export function useDashboardStream(versionId: string) {
  const [charts, setCharts] = useState<Record<string, ChartResult>>({});
  const [kpis, setKpis] = useState<Record<string, ChartResult>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receivedCharts = useRef<Set<string>>(new Set());
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (!versionId) return;

    let es: EventSource | null = null;

    const connect = () => {
      es = new EventSource(buildSseUrl(versionId));

      es.onmessage = (event) => {
        try {
          const result: ChartResult = JSON.parse(event.data);

          if (result.event === 'done') {
            setDone(true);
            es?.close();
            retryCountRef.current = 0;
            return;
          }

          if (result.error) {
            setError(result.error);
            return;
          }

          const id = result.chart_id || result.kpi_id;
          if (id && !receivedCharts.current.has(id)) {
            receivedCharts.current.add(id);
            if (result.chart_id) {
              const chartId = result.chart_id;
              setCharts((prev) => ({ ...prev, [chartId]: result }));
            } else if (result.kpi_id) {
              const kpiId = result.kpi_id;
              setKpis((prev) => ({ ...prev, [kpiId]: result }));
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
          setError('Connection to dashboard stream lost after multiple retries.');
        }
      };
    };

    connect();

    return () => {
      if (es) es.close();
    };
  }, [versionId]);

  return { charts, kpis, done, error };
}
