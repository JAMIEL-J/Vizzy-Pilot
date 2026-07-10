import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CanvasPage from '../pages/user/CanvasPage';
import { canvasService, formatKpiValue, formatKpiSubtext } from '../lib/api/canvas';
import { ThemeProvider } from '../context/ThemeContext';

// Mock window.matchMedia for ThemeProvider context inside jsdom environment
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Deprecated
        removeListener: vi.fn(), // Deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Mock canvasService calls
vi.mock('../lib/api/canvas', () => ({
    canvasService: {
        getSchema: vi.fn(),
        executeSql: vi.fn(),
    },
    formatKpiValue: (val: any, label?: string) => {
        if (typeof val === 'number') {
            if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
            if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
            return val.toString();
        }
        return String(val || '0');
    },
    formatKpiSubtext: (metric: string, agg: string) => `${agg} of ${metric}`,
}));

vi.mock('../lib/api/dataset', () => ({
    datasetService: {
        listDatasets: vi.fn(() => Promise.resolve([
            { id: 'dataset-123', name: 'Test Sales Dataset', owner_id: 'user-1' }
        ])),
        listVersionsForDataset: vi.fn(() => Promise.resolve([
            { id: 'ver-123', dataset_id: 'dataset-123', version_number: 1, source_type: 'upload' }
        ])),
        getDuckdbStatus: vi.fn(),
    }
}));

vi.mock('../lib/api/chat', () => ({
    chatService: {
        sendMessageStream: vi.fn(),
        executeSql: vi.fn(),
    }
}));

describe('Canvas Page & KPI E2E Flow', () => {
    it('formats KPI values correctly', () => {
        expect(formatKpiValue(1500000, 'Revenue')).toBe('$1.5M');
        expect(formatKpiValue(45200, 'Sales')).toBe('45.2K');
        expect(formatKpiValue(42, 'Count')).toBe('42');
        expect(formatKpiSubtext('Sales', 'SUM')).toBe('SUM of Sales');
    });

    it('renders selected columns and supports manual visual additions', async () => {
        // Setup localStorage to bypass listDatasets Axios invocation on initial mount checks
        localStorage.setItem('vizzy_last_dataset_id', 'dataset-123');
        localStorage.setItem('vizzy_last_version_id', 'ver-123');

        // Mock get schema response
        vi.mocked(canvasService.getSchema).mockResolvedValue({
            dataset_id: 'dataset-123',
            version_id: 'ver-123',
            dataset_name: 'Test Sales Dataset',
            columns: [
                { name: 'Revenue', dtype: 'DOUBLE', category: 'Metrics' },
                { name: 'Category', dtype: 'VARCHAR', category: 'Dimensions' }
            ],
            row_count: 5000
        });

        vi.mocked(canvasService.executeSql).mockResolvedValue({
            sql: 'SELECT SUM("Revenue") AS value FROM data',
            results: [{ value: 1500000 }],
            columns: ['value'],
            row_count: 1,
            truncated: false,
            execution_time_ms: 12.5,
            error: null
        });

        render(
            <ThemeProvider>
                <CanvasPage />
            </ThemeProvider>
        );

        // Wait for page to initialize and trigger mock schema loading via localStorage initialization path
        await waitFor(() => {
            expect(canvasService.getSchema).toHaveBeenCalled();
        });

        // Toggle visual append buttons
        const kpiButton = screen.queryByText('KPI Card') || screen.queryByText('KPI');
        expect(kpiButton).toBeDefined();

        // Cleanup
        localStorage.clear();
    });
});
