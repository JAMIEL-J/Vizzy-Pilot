// @ts-nocheck
/* ─── Dashboard Helpers ──────────────────────────────────────────────
   Extracted from UserDashboard.tsx for reuse across components.       */

export const toLabel = (col: string): string =>
    col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

export const normalizeColumnKey = (value: string): string =>
    String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const DOMAIN_TITLES: Record<string, string> = {
    sales: 'Revenue Intelligence',
    churn: 'Customer Retention Analytics',
    marketing: 'Campaign Performance',
    finance: 'Financial Overview',
    healthcare: 'Clinical Operations',
    generic: 'Analytics Overview',
};

export function getDashboardTitle(domain: string | undefined): string {
    if (!domain) return 'Analytics Overview';
    return DOMAIN_TITLES[domain.toLowerCase()] ?? 'Analytics Overview';
}

export function prettifyLabel(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function formatBooleanLikeLabel(value: any): string {
    const raw = String(value ?? '').trim();
    if (!raw) return 'Unknown';

    const normalized = toNormalized(raw);
    if (['true', '1', '1.0', 'yes', 'y'].includes(normalized)) return 'Yes';
    if (['false', '0', '0.0', 'no', 'n'].includes(normalized)) return 'No';

    return raw;
}

export function getTargetSemanticLabels(targetColumn?: string): { positive: string; negative: string; all: string } {
    const rawKey = (targetColumn || '').toLowerCase();
    const key = rawKey.replace(/[_\s-]/g, '');
    const tokenizedKey = rawKey.replace(/[_-]/g, ' ');

    if (key.includes('churn')) return { positive: 'Churned', negative: 'Retained', all: 'All Customers' };
    if (key.includes('exit')) return { positive: 'Exited', negative: 'Stayed', all: 'All Customers' };
    if (key.includes('attrition')) return { positive: 'Attrited', negative: 'Retained', all: 'All Employees' };
    if (/\b(left|leave)\b/i.test(tokenizedKey)) return { positive: 'Left', negative: 'Stayed', all: 'All Population' };
    if (key.includes('cancel')) return { positive: 'Cancelled', negative: 'Active', all: 'All Customers' };

    return { positive: 'Positive', negative: 'Negative', all: `All ${prettifyLabel(targetColumn || 'Target')}` };
}

export function isBinaryTargetValue(value: string): boolean {
    const v = value.toLowerCase().trim();
    const known = new Set([
        '0', '1', 'true', 'false', 'yes', 'no', 'y', 'n',
        'retained', 'churned', 'exited', 'attrited', 'left', 'stayed', 'active', 'inactive'
    ]);
    return known.has(v);
}

export function isPositiveBinaryValue(value: string): boolean {
    const v = value.toLowerCase().trim();
    const positive = new Set(['1', 'true', 'yes', 'y', 'churned', 'exited', 'attrited', 'left', 'inactive']);
    return positive.has(v);
}

export function toNormalized(value: string): string {
    return String(value || '').trim().toLowerCase();
}

export function getBinarySemanticBucket(value: string): 'positive' | 'negative' | null {
    const normalized = toNormalized(value);
    if (!normalized) return null;

    if (isPositiveBinaryValue(normalized)) return 'positive';
    if (isBinaryTargetValue(normalized)) return 'negative';
    return null;
}

export function resolveValueAgainstColumnOptions(
    rawValue: string,
    candidateValues: string[],
    targetColumn?: string | null,
    selectedColumn?: string | null,
): string {
    const normalizedInput = toNormalized(rawValue);
    if (!normalizedInput || !Array.isArray(candidateValues) || candidateValues.length === 0) {
        return rawValue;
    }

    const direct = candidateValues.find((v) => toNormalized(String(v)) === normalizedInput);
    if (direct) return String(direct);

    const isTargetColumn = !!(
        targetColumn
        && selectedColumn
        && normalizeColumnKey(String(targetColumn)) === normalizeColumnKey(String(selectedColumn))
    );

    if (isTargetColumn) {
        const semanticTargetMatch = candidateValues.find(
            (v) => toNormalized(formatTargetTabLabel(String(v), targetColumn || undefined)) === normalizedInput
        );
        if (semanticTargetMatch) return String(semanticTargetMatch);
    }

    const desiredBucket = getBinarySemanticBucket(normalizedInput);
    if (!desiredBucket) return rawValue;

    const binaryEquivalent = candidateValues.find((v) => getBinarySemanticBucket(String(v)) === desiredBucket);
    return binaryEquivalent ? String(binaryEquivalent) : rawValue;
}

export function formatTargetTabLabel(value: string, targetColumn?: string): string {
    const raw = String(value);
    if (!isBinaryTargetValue(raw)) return prettifyLabel(raw);

    const labels = getTargetSemanticLabels(targetColumn);
    return isPositiveBinaryValue(raw) ? labels.positive : labels.negative;
}


export interface ChartItem {
    id: string;
    type: string;
    title?: string;
    dimension?: string;
    metric?: string;
    aggregation?: string;
    data: any[];
    data_without_outliers?: any[];
    section: string;
    confidence?: number;
    value_label?: string;
    geo_meta?: {
        map_type?: string;
        [key: string]: any;
    };
    categories?: string[];
    [key: string]: any;
}
