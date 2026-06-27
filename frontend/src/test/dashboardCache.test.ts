import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const DASHBOARD_SESSION_CACHE_KEY = 'vizzy.dashboard.analyticsCache.v3';

const stripHeavyFields = (value: any) => {
    if (!value || typeof value !== 'object') return value;
    const { raw_data, ...rest } = value;
    return rest;
};

const setSessionCachedAnalytics = (key: string, value: any) => {
    const all: Record<string, any> = {};
    all[key] = { createdAt: Date.now(), value: stripHeavyFields(value) };
    try {
        sessionStorage.setItem(DASHBOARD_SESSION_CACHE_KEY, JSON.stringify(all));
    } catch (err) {
        console.warn('[dashboard-cache] sessionStorage write failed; falling back to in-memory only', err);
        try {
            sessionStorage.removeItem(DASHBOARD_SESSION_CACHE_KEY);
        } catch {
            /* ignore */
        }
    }
};

describe('dashboard cache payload shape', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('strips raw_data from session-cached payload to avoid quota blowups', () => {
        const bigRawData = Array.from({ length: 50000 }, (_, i) => ({
            row: i,
            payload: 'x'.repeat(40),
        }));
        const analytics = {
            dataset_name: 'sample',
            kpis: { kpi_1: { title: 't', value: 1, format: 'number' } },
            charts: { slot_1: { type: 'bar', data: [{ x: 'A', y: 1 }] } },
            raw_data: bigRawData,
        };

        setSessionCachedAnalytics('cache-key', analytics);

        const stored = sessionStorage.getItem(DASHBOARD_SESSION_CACHE_KEY);
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored as string);
        const entry = parsed['cache-key'];
        expect(entry).toBeTruthy();
        expect(entry.value.raw_data).toBeUndefined();
        expect(entry.value.kpis).toEqual({ kpi_1: { title: 't', value: 1, format: 'number' } });
        expect(entry.value.charts).toEqual({ slot_1: { type: 'bar', data: [{ x: 'A', y: 1 }] } });
    });

    it('falls back to a clean state when sessionStorage.setItem throws (quota exceeded)', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        });
        const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => undefined);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        setSessionCachedAnalytics('cache-key', { big: 'payload' });

        expect(setItemSpy).toHaveBeenCalled();
        expect(removeItemSpy).toHaveBeenCalledWith(DASHBOARD_SESSION_CACHE_KEY);
        expect(warn).toHaveBeenCalled();
        const message = String(warn.mock.calls[0][0]);
        expect(message).toMatch(/sessionStorage write failed/);
    });
});

