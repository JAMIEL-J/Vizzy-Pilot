import React, { useEffect, useMemo, useState } from 'react';
import {
    Chart as ChartJS,
    Legend as ChartLegend,
    Tooltip as ChartTooltip,
} from 'chart.js';
import {
    ChoroplethController,
    ColorScale,
    GeoFeature,
    ProjectionScale,
} from 'chartjs-chart-geo';
import { Chart as ReactChart } from 'react-chartjs-2';
import { feature as topojsonFeature } from 'topojson-client';

ChartJS.register(ChoroplethController, GeoFeature, ProjectionScale, ColorScale, ChartTooltip, ChartLegend);

// ─── TopoJSON Sources ─────────────────────────────────────────────────────────
const GEO_URLS = {
    world: "https://unpkg.com/world-atlas@2.0.2/countries-110m.json",
    us_states: "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
};

// ─── US state abbreviation → full name ───────────────────────────────────────
const US_ABBREV_TO_FULL: Record<string, string> = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
    ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia"
};

// ─── World country alias map ──────────────────────────────────────────────────
const WORLD_ALIAS: Record<string, string> = {
    "usa": "United States of America",
    "us": "United States of America",
    "united states": "United States of America",
    "uk": "United Kingdom",
    "gb": "United Kingdom",
    "uae": "United Arab Emirates",
    "ae": "United Arab Emirates",
    "russia": "Russian Federation",
    "ru": "Russian Federation",
    "south korea": "South Korea",
    "kr": "South Korea",
    "korea": "South Korea",
    "czech republic": "Czechia",
    "cz": "Czechia",
    "ca": "Canada",
    "de": "Germany",
    "fr": "France",
    "au": "Australia",
    "in": "India",
    "br": "Brazil",
    "cn": "China",
    "jp": "Japan",
    "it": "Italy",
    "es": "Spain",
    "mx": "Mexico",
    "nl": "Netherlands",
    "ch": "Switzerland",
    "se": "Sweden",
    "id": "Indonesia",
    "tr": "Turkey",
    "sa": "Saudi Arabia",
    "za": "South Africa",
    "ar": "Argentina",
    "pl": "Poland",
    "th": "Thailand",
    "il": "Israel",
    "sg": "Singapore",
    "my": "Malaysia",
    "ph": "Philippines",
    "vn": "Vietnam",
    "nz": "New Zealand",
    "ie": "Ireland",
    "dk": "Denmark",
    "no": "Norway",
    "fi": "Finland",
    "pt": "Portugal",
    "gr": "Greece",
    "ro": "Romania",
    "hu": "Hungary",
    "at": "Austria",
    "be": "Belgium"
};

// ─── Major City → US State / Country aliases ────────────────────────────────
const CITY_TO_REGION: Record<string, string> = {
    // US Cities -> US States
    "miami": "florida", "los angeles": "california", "san francisco": "california", 
    "san diego": "california", "new york": "new york", "new york city": "new york", 
    "nyc": "new york", "chicago": "illinois", "houston": "texas", "dallas": "texas", 
    "austin": "texas", "seattle": "washington", "boston": "massachusetts", 
    "atlanta": "georgia", "las vegas": "nevada", "denver": "colorado", 
    "philadelphia": "pennsylvania", "phoenix": "arizona", "detroit": "michigan",
    "portland": "oregon", "nashville": "tennessee", "orlando": "florida",
    "washington dc": "district of columbia", "dc": "district of columbia",
    
    // World Cities -> Countries
    "london": "united kingdom", "paris": "france", "tokyo": "japan",
    "berlin": "germany", "madrid": "spain", "rome": "italy", "toronto": "canada",
    "vancouver": "canada", "sydney": "australia", "melbourne": "australia",
    "dubai": "united arab emirates", "beijing": "china", "shanghai": "china",
    "mumbai": "india", "delhi": "india", "mexico city": "mexico", 
    "sao paulo": "brazil", "seoul": "south korea", "singapore": "singapore",
    "amsterdam": "netherlands", "moscow": "russian federation"
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeoDataPoint {
    name: string;
    value?: number;
    metrics?: Record<string, number>;
    [key: string]: any;
}

interface GeoMapCardProps {
    data: GeoDataPoint[];
    mapType?: 'world' | 'us_states';
    chartTitle?: string;
    formatType?: string;
    isDark?: boolean;
    quickReact?: boolean;
}

const GeoMapCard: React.FC<GeoMapCardProps> = ({ data, mapType: providedMapType = 'world', chartTitle, formatType, isDark = true, quickReact = false }) => {
    const [features, setFeatures] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [zoom, setZoom] = useState<number>(1);
    const [selectedMetric, setSelectedMetric] = useState<string>('value');

    const mapType = useMemo(() => {
        if (!data || data.length === 0) return providedMapType;
        if (providedMapType === 'us_states') return 'us_states';
        const names = data.map(d => {
            if (d?.name) return String(d.name);
            if (d?.label) return String(d.label);
            const strKey = Object.keys(d || {}).find(k => {
                const lowerK = String(k).toLowerCase();
                return lowerK !== 'value' && !lowerK.includes('metric') && typeof d[k] === 'string' && isNaN(Number(d[k]));
            });
            return String(strKey ? d[strKey] : '');
        }).map(s => s.trim().toUpperCase());
        
        // Unambiguous world indicators (countries that are definitely not US states)
        const worldIndicators = ['US', 'USA', 'UK', 'GB', 'FR', 'AU', 'JP', 'IT', 'ES', 'BR', 'CN', 'RU', 'ZA', 'MX', 'UNITED STATES', 'UNITED KINGDOM', 'GERMANY', 'FRANCE', 'AUSTRALIA', 'CANADA'];
        const worldMatches = names.filter(n => worldIndicators.includes(n));
        
        // Count how many are world cities
        const worldCityMatches = names.filter(n => {
            const mapped = CITY_TO_REGION[n.toLowerCase()];
            return mapped && !Object.values(US_ABBREV_TO_FULL).map(s=>s.toLowerCase()).includes(mapped);
        });
        if (worldMatches.length > 0 || (worldCityMatches.length > 0 && worldCityMatches.length > names.length * 0.2)) return 'world';

        const usAbbrevs = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
        const fullStates = Object.values(US_ABBREV_TO_FULL).map(s => s.toUpperCase());
        const usCityMatches = names.filter(n => {
            const mapped = CITY_TO_REGION[n.toLowerCase()];
            return mapped && Object.values(US_ABBREV_TO_FULL).map(s=>s.toLowerCase()).includes(mapped);
        });
        
        const matches = names.filter(n => usAbbrevs.includes(n) || fullStates.includes(n));
        if ((matches.length + usCityMatches.length) > 0 && (matches.length + usCityMatches.length) / names.length >= 0.25) return 'us_states';
        return providedMapType;
    }, [data, providedMapType]);

    const geoUrl = GEO_URLS[mapType];

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch(geoUrl);
                const topo = await res.json();
                const objectKey = mapType === 'us_states' ? 'states' : 'countries';
                const obj = topo?.objects?.[objectKey];
                const geo = obj ? (topojsonFeature(topo, obj) as any) : null;
                if (!cancelled) {
                    setFeatures(Array.isArray(geo?.features) ? geo.features : []);
                }
            } catch {
                if (!cancelled) setFeatures([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [geoUrl, mapType]);

    // Build O(1) lookup map from normalized name → data point
    const dataLookup = useMemo(() => {
        const map = new Map<string, GeoDataPoint>();
        
        // Helper to find the correct string key for the dimension
        const getName = (d: any) => {
            if (d?.name) return d.name;
            if (d?.label) return d.label;
            // Fallback to finding the first string property that isn't 'value' or 'metrics'
            const strKey = Object.keys(d || {}).find(k => {
                const lowerK = String(k).toLowerCase();
                return lowerK !== 'value' && !lowerK.includes('metric') && typeof d[k] === 'string' && isNaN(Number(d[k]));
            });
            return strKey ? d[strKey] : undefined;
        };

        data.forEach((d) => {
            const rawName = getName(d);
            const raw = String(rawName || '').trim();
            if (!raw) return;
            const lower = raw.toLowerCase();
            
            // Map city directly to state/country if it exists
            const aliasedLower = CITY_TO_REGION[lower] || lower;

            // Simple additive aggregation for cities mapped to the same state/country
            if (map.has(aliasedLower)) {
                const existing = map.get(aliasedLower)!;
                const newValue = { ...existing };
                if (typeof d.value === 'number') {
                    newValue.value = (Number(existing.value) || 0) + d.value;
                }
                const existingNames = Array.isArray(existing._originalNames) ? existing._originalNames : (existing.name ? [existing.name] : []);
                newValue._originalNames = Array.from(new Set([...existingNames, rawName]));
                map.set(aliasedLower, newValue);
            } else {
                const newValue = { ...d, _originalNames: [rawName] };
                map.set(aliasedLower, newValue);
            }

            // Also maintain the expanded aliases for US States / World Countries
            if (mapType === 'us_states') {
                const expanded = US_ABBREV_TO_FULL[raw.toUpperCase()];
                if (expanded) {
                    const expLower = expanded.toLowerCase();
                    if (map.has(expLower)) {
                        const existing = map.get(expLower)!;
                        const newValue = { ...existing };
                        if (typeof d.value === 'number') newValue.value = (Number(existing.value) || 0) + d.value;
                        const existingNames = Array.isArray(existing._originalNames) ? existing._originalNames : (existing.name ? [existing.name] : []);
                        newValue._originalNames = Array.from(new Set([...existingNames, rawName]));
                        map.set(expLower, newValue);
                    } else {
                        map.set(expLower, { ...d, _originalNames: [rawName] });
                    }
                }
            }

            if (mapType === 'world') {
                const wAliased = WORLD_ALIAS[lower];
                if (wAliased) {
                    const wLower = wAliased.toLowerCase();
                    if (map.has(wLower)) {
                        const existing = map.get(wLower)!;
                        const newValue = { ...existing };
                        if (typeof d.value === 'number') newValue.value = (Number(existing.value) || 0) + d.value;
                        const existingNames = Array.isArray(existing._originalNames) ? existing._originalNames : (existing.name ? [existing.name] : []);
                        newValue._originalNames = Array.from(new Set([...existingNames, rawName]));
                        map.set(wLower, newValue);
                    } else {
                        map.set(wLower, { ...d, _originalNames: [rawName] });
                    }
                }
            }
        });
        return map;
    }, [data, mapType]);

    const resolveDataByName = (name: string): GeoDataPoint | undefined => {
        const lower = String(name || '').toLowerCase().trim();
        if (!lower) return undefined;
        if (dataLookup.has(lower)) return dataLookup.get(lower);

        if (mapType === 'world') {
            const reverseAlias = Object.entries(WORLD_ALIAS).find(([, canonical]) => canonical.toLowerCase() === lower);
            if (reverseAlias && dataLookup.has(reverseAlias[0])) return dataLookup.get(reverseAlias[0]);
        }
        return undefined;
    };

    const chartTitleLower = (chartTitle || '').toLowerCase();
    const forceNotMoney = ['tenure', 'age', 'duration', 'months', 'years', 'days'].some(k => chartTitleLower.includes(k));
    const isMoney = formatType === 'currency' || (!formatType && !forceNotMoney && ['revenue', 'charges', 'cost', 'price', 'amount', 'sales', 'income', 'expense', 'profit', 'dollar', 'payment']
        .some(k => chartTitleLower.includes(k)));
    const isPercent = formatType === 'percentage' || formatType === 'percent' || (!formatType && (chartTitleLower.includes('rate') || chartTitleLower.includes('%')));

    const isCurrencyMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        if (!token) return false;
        return ['revenue', 'cost', 'costs', 'spend', 'budget', 'income', 'sales', 'profit', 'payment', 'charge', 'charges', 'price', 'amount', 'roi', 'roas'].some((kw) => token.includes(kw));
    };

    const isPercentMetricLabel = (label?: string) => {
        const token = String(label || '').toLowerCase();
        if (!token) return false;
        return ['rate', 'percent', 'percentage', 'pct', 'ctr', 'cvr', 'ratio', 'margin'].some((kw) => token.includes(kw));
    };

    const prettyLabel = (value: string) => {
        const raw = String(value || '').trim();
        if (!raw) return 'Value';
        return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const fmtVal = (v: any, metricLabel?: string): string => {
        if (typeof v !== 'number') return String(v ?? '');
        const labelLooksCurrency = isCurrencyMetricLabel(metricLabel);
        const labelLooksPercent = isPercentMetricLabel(metricLabel);

        if (labelLooksCurrency || (isMoney && !labelLooksPercent)) {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);
        }
        if (labelLooksPercent || isPercent) {
            return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
        }
        if (formatType === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
        return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    };
    const metricLabel = useMemo(() => {
        if (!chartTitle) return 'Value';
        const parts = chartTitle.split(/ by | per /i);
        return parts.length === 2 ? parts[0].trim() : chartTitle;
    }, [chartTitle]);

    const choroplethRows = useMemo(() => {
        return features.map((featureItem: any) => {
            const name = String(featureItem?.properties?.name || '').trim();
            const matched = resolveDataByName(name);

            const explicitMetrics = matched?.metrics && typeof matched.metrics === 'object'
                ? Object.fromEntries(
                    Object.entries(matched.metrics)
                        .filter(([, val]) => typeof val === 'number' && Number.isFinite(val))
                )
                : undefined;

            const derivedMetrics = matched
                ? Object.fromEntries(
                    Object.entries(matched)
                        .filter(([key, val]) => !['name', 'value', 'metrics'].includes(key) && typeof val === 'number' && Number.isFinite(val))
                )
                : undefined;

            const metrics = explicitMetrics && Object.keys(explicitMetrics).length > 0
                ? explicitMetrics
                : (derivedMetrics && Object.keys(derivedMetrics).length > 0 ? derivedMetrics : undefined);

            const rowValue = matched && Number.isFinite(Number(matched.value))
                ? Number(matched.value)
                : (metrics ? Number(Object.values(metrics)[0]) : undefined);

            return {
                feature: featureItem,
                name,
                value: rowValue,
                metrics,
                originalNames: matched?._originalNames,
            };
        });
    }, [features, dataLookup]);

    const metricKeys = useMemo(() => {
        const keys = new Set<string>();
        choroplethRows.forEach((row) => {
            Object.keys(row.metrics || {}).forEach((key) => keys.add(key));
        });
        return Array.from(keys);
    }, [choroplethRows]);

    useEffect(() => {
        if (!metricKeys.length) {
            setSelectedMetric('value');
            return;
        }

        setSelectedMetric((prev) => {
            if (metricKeys.includes(prev)) return prev;

            const title = chartTitleLower;
            const revenueKey = metricKeys.find((k) => /revenue|sales|income|amount/i.test(k));
            const profitKey = metricKeys.find((k) => /profit|margin|earnings/i.test(k));

            if (title.includes('revenue') && revenueKey) return revenueKey;
            if (title.includes('profit') && profitKey) return profitKey;
            if (revenueKey) return revenueKey;
            if (profitKey) return profitKey;
            return metricKeys[0];
        });
    }, [metricKeys, chartTitleLower]);

    const metricDisplayName = useMemo(() => {
        if (selectedMetric === 'value') return metricLabel;
        return prettyLabel(selectedMetric);
    }, [selectedMetric, metricLabel]);

    const rowMetricValue = (row: { value?: number; metrics?: Record<string, number> }) => {
        if (selectedMetric !== 'value' && row.metrics && Number.isFinite(Number(row.metrics[selectedMetric]))) {
            return Number(row.metrics[selectedMetric]);
        }
        return Number.isFinite(Number(row.value)) ? Number(row.value) : undefined;
    };

    const selectedMetricValues = useMemo(() => {
        return choroplethRows
            .map((row) => rowMetricValue(row))
            .filter((v): v is number => Number.isFinite(Number(v)));
    }, [choroplethRows, selectedMetric]);

    const maxValue = useMemo(() => {
        const vals = selectedMetricValues.filter((v) => Number.isFinite(v));
        return vals.length ? Math.max(...vals) : 1;
    }, [selectedMetricValues]);

    const minValue = useMemo(() => {
        const vals = selectedMetricValues.filter((v) => Number.isFinite(v));
        return vals.length ? Math.min(...vals) : 0;
    }, [selectedMetricValues]);

    const matchedCount = useMemo(() => {
        return choroplethRows.filter((row) => {
            const v = rowMetricValue(row);
            return typeof v === 'number' && Number.isFinite(v);
        }).length;
    }, [choroplethRows, selectedMetric]);

    const selectedMetricInterpolate = useMemo(() => {
        const key = String(selectedMetric || '').toLowerCase();
        if (/revenue|sales|income|amount/.test(key)) return 'blues';
        if (/profit|margin|earnings/.test(key)) return 'greens';
        return 'purples';
    }, [selectedMetric]);

    const selectedMetricLegendGradient = useMemo(() => {
        const key = String(selectedMetric || '').toLowerCase();
        if (/revenue|sales|income|amount/.test(key)) {
            return isDark
                ? 'linear-gradient(to right, #0b254a, #1d4ed8, #60a5fa)'
                : 'linear-gradient(to right, #dbeafe, #60a5fa, #1d4ed8)';
        }
        if (/profit|margin|earnings/.test(key)) {
            return isDark
                ? 'linear-gradient(to right, #052e16, #047857, #34d399)'
                : 'linear-gradient(to right, #dcfce7, #34d399, #047857)';
        }
        return isDark
            ? 'linear-gradient(to right, #1f1637, #6d28d9, #a78bfa)'
            : 'linear-gradient(to right, #ede9fe, #a78bfa, #6d28d9)';
    }, [selectedMetric, isDark]);

    const chartData = useMemo(() => {
        return {
            labels: choroplethRows.map((row) => row.name),
            datasets: [
                {
                    label: metricDisplayName,
                    outline: choroplethRows.map((row) => row.feature),
                    data: choroplethRows.map((row) => ({
                        feature: row.feature,
                        value: rowMetricValue(row),
                        metrics: row.metrics,
                        originalNames: row.originalNames,
                    })),
                },
            ],
        };
    }, [choroplethRows, metricDisplayName, selectedMetric]);

    const options = useMemo(() => {
        return {
            maintainAspectRatio: false,
            responsive: true,
            animation: {
                duration: quickReact ? 140 : 650,
                easing: quickReact ? 'linear' : 'easeOutCubic',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
                    titleColor: isDark ? '#ffffff' : '#0f172a',
                    bodyColor: isDark ? '#d1d5db' : '#334155',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.15)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: (items: any[]) => {
                            const raw = items?.[0]?.raw;
                            const stateName = String(raw?.feature?.properties?.name || items?.[0]?.label || 'Region');
                            const orig = raw?.originalNames;
                            if (orig && Array.isArray(orig) && orig.length > 0) {
                                const filtered = orig.filter(n => String(n).toLowerCase() !== stateName.toLowerCase());
                                if (filtered.length > 0) {
                                    return `${stateName} (${filtered.join(', ')})`;
                                }
                            }
                            return stateName;
                        },
                        label: (ctx: any) => {
                            const rawVal = ctx?.raw?.value;
                            const rawMetrics = ctx?.raw?.metrics && typeof ctx.raw.metrics === 'object' ? ctx.raw.metrics : null;
                            if (rawMetrics && Object.keys(rawMetrics).length > 0) {
                                return Object.entries(rawMetrics).map(([key, val]) => {
                                    if (!Number.isFinite(Number(val))) return ` ${prettyLabel(key)}: No data`;
                                    return ` ${prettyLabel(key)}: ${fmtVal(Number(val), key)}`;
                                });
                            }
                            if (!Number.isFinite(rawVal)) return ` ${metricDisplayName}: No data`;
                            return ` ${metricDisplayName}: ${fmtVal(rawVal, selectedMetric)}`;
                        },
                    },
                },
            },
            scales: {
                projection: {
                    axis: 'x',
                    projection: mapType === 'us_states' ? 'albersUsa' : 'equalEarth',
                },
                color: {
                    display: false,
                    axis: 'x',
                    min: minValue === maxValue ? minValue - 1 : minValue,
                    max: minValue === maxValue ? maxValue + 1 : Math.max(maxValue, minValue + 1),
                    quantize: 6,
                    interpolate: selectedMetricInterpolate,
                    missing: isDark ? '#171717' : '#EFEDED',
                    ticks: { display: false },
                    grid: { display: false },
                    legend: {
                        display: false,
                    },
                },
            },
            elements: {
                geoFeature: {
                    borderColor: isDark ? '#000000' : '#E5E2DE',
                    borderWidth: mapType === 'us_states' ? 0.5 : 0.3,
                    hoverBorderColor: isDark ? '#ffffff' : '#000000',
                    hoverBorderWidth: 0.8,
                },
            },
        } as any;
    }, [fmtVal, isDark, mapType, maxValue, metricDisplayName, quickReact, selectedMetric, selectedMetricInterpolate]);

    return (
        <div className="relative w-full h-[220px] overflow-hidden rounded-xl bg-surface-container-lowest dark:bg-surface-container/80 dark:backdrop-blur-md border border-transparent dark:border-white/5 shadow-sm dark:shadow-none transition-colors duration-300">
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-bg-card/55 dark:bg-black/55 backdrop-blur-md px-2 py-0.5 border border-border-main rounded-sm shadow-sm">
                <span className="text-[9px] font-mono tracking-widest uppercase font-bold text-primary">
                    {mapType === 'us_states' ? 'US States' : 'World Map'}
                </span>
                <span className="text-[8px] font-mono uppercase tracking-widest text-themed-muted">· {matchedCount} regions</span>
            </div>

            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                {metricKeys.length > 1 && (
                    <select
                        value={selectedMetric}
                        onChange={(e) => setSelectedMetric(e.target.value)}
                        className="h-6 text-[10px] px-2 rounded bg-bg-card/70 dark:bg-black/60 border border-border-main text-themed-main"
                        aria-label="Select map metric"
                    >
                        {metricKeys.map((key) => (
                            <option key={key} value={key}>{prettyLabel(key)}</option>
                        ))}
                    </select>
                )}
                <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.2).toFixed(2))))}
                    className="h-6 w-6 rounded bg-bg-card/70 dark:bg-black/60 border border-border-main text-themed-main text-xs"
                    aria-label="Zoom in map"
                >
                    +
                </button>
                <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(1, Number((z - 0.2).toFixed(2))))}
                    className="h-6 w-6 rounded bg-bg-card/70 dark:bg-black/60 border border-border-main text-themed-main text-xs"
                    aria-label="Zoom out map"
                >
                    -
                </button>
            </div>

            {loading ? (
                <div className="h-full w-full flex items-center justify-center text-themed-muted text-xs">Loading map...</div>
            ) : features.length === 0 ? (
                <div className="h-full w-full flex items-center justify-center text-themed-muted text-xs">Unable to load map geography.</div>
            ) : (
                <div className="h-full w-full pt-6 pb-6 px-1 overflow-hidden">
                    <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 160ms ease-out' }}>
                        <ReactChart key={mapType} type={'choropleth' as any} data={chartData as any} options={options as any} />
                    </div>
                </div>
            )}

            <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 bg-bg-card/65 dark:bg-black/65 border border-border-main backdrop-blur-md px-2 py-1 rounded-sm shadow-sm">
                <span className="text-[8px] text-themed-muted uppercase tracking-widest">{fmtVal(minValue, selectedMetric)}</span>
                <div className="w-20 h-1 rounded-sm" style={{ background: selectedMetricLegendGradient }} />
                <span className="text-[8px] text-primary uppercase tracking-widest">{fmtVal(maxValue, selectedMetric)}</span>
            </div>
        </div>
    );
};

export default GeoMapCard;
