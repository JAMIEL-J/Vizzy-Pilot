import React, { useEffect, useMemo, useState, useRef } from 'react';
import { feature as topojsonFeature } from 'topojson-client';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { formatKpiValue } from '../../lib/api/canvas';

// TopoJSON Sources
const GEO_URLS = {
  world: "https://unpkg.com/world-atlas@2.0.2/countries-110m.json",
  us_states: "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
};

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
  "ca": "Canada", "de": "Germany", "fr": "France", "au": "Australia", "in": "India"
};

interface GeoDataPoint {
  label: string;
  [key: string]: any;
}

interface CustomGeoMapProps {
  data: GeoDataPoint[];
  isDark?: boolean;
  color?: string;
  formatConfig?: any;
  targetMetricName?: string;
  isFullScreen?: boolean;
}

export const CustomGeoMap: React.FC<CustomGeoMapProps> = ({ 
  data = [], 
  isDark = true, 
  color = '#3B82F6',
  formatConfig,
  targetMetricName,
  isFullScreen = false
}) => {
  const [features, setFeatures] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 280 });

  // Dynamic detection of all active metrics inside queryData
  const metricKeys = useMemo(() => {
    if (data.length === 0) return ['value'];
    const keys = Object.keys(data[0]);
    return keys.filter(k => k !== 'label' && k !== 'name' && typeof data[0][k] === 'number');
  }, [data]);

  const primaryMetricKey = metricKeys[0] || 'value';

  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    title: string;
    metrics: Record<string, number>;
    visible: boolean;
  } | null>(null);

  // ResizeObserver to track container boundaries reactively
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({
          width: Math.max(width, 100),
          height: Math.max(height, 100)
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Auto-detect Map Type
  const mapType = useMemo(() => {
    if (data.length === 0) return 'world';
    const names = data.map(d => String(d.label || d.name || '').trim().toUpperCase());
    const usKeys = Object.keys(US_ABBREV_TO_FULL);
    const usStateNames = Object.values(US_ABBREV_TO_FULL).map(s => s.toUpperCase());
    
    const usMatches = names.filter(n => usKeys.includes(n) || usStateNames.includes(n));
    if (usMatches.length / names.length >= 0.2) return 'us_states';
    return 'world';
  }, [data]);

  const geoUrl = GEO_URLS[mapType];

  // Load TopoJSON features
  useEffect(() => {
    let active = true;
    const fetchGeo = async () => {
      setLoading(true);
      try {
        const res = await fetch(geoUrl);
        const topo = await res.json();
        const objectKey = mapType === 'us_states' ? 'states' : 'countries';
        const obj = topo?.objects?.[objectKey];
        if (obj && active) {
          const geojson = topojsonFeature(topo, obj) as any;
          setFeatures(Array.isArray(geojson?.features) ? geojson.features : []);
        }
      } catch (err) {
        console.error("Failed to load map TopoJSON:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchGeo();
    return () => { active = false; };
  }, [geoUrl, mapType]);

  // Compute bounding box for projection
  const bounds = useMemo(() => {
    if (features.length === 0) return { minLon: -180, maxLon: 180, minLat: -90, maxLat: 90 };
    
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    
    features.forEach(f => {
      const process = (coords: any) => {
        if (typeof coords[0] === 'number') {
          const [lon, lat] = coords;
          if (lon > -170 && lon < 170 && lat > -56 && lat < 78) {
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        } else {
          coords.forEach(process);
        }
      };
      if (f.geometry) process(f.geometry.coordinates);
    });

    const padLon = (maxLon - minLon) * 0.05 || 10;
    const padLat = (maxLat - minLat) * 0.05 || 10;

    return {
      minLon: minLon - padLon,
      maxLon: maxLon + padLon,
      minLat: minLat - padLat,
      maxLat: maxLat + padLat
    };
  }, [features]);

  // Equirectangular Map projection function matching dynamic width/height
  const project = (coords: [number, number], w: number, h: number) => {
    const [lon, lat] = coords;
    const { minLon, maxLon, minLat, maxLat } = bounds;
    
    const x = ((lon - minLon) / (maxLon - minLon)) * w;
    const y = (1 - (lat - minLat) / (maxLat - minLat)) * h;
    return [x, y];
  };

  const getPathData = (geometry: any, w: number, h: number) => {
    if (!geometry) return '';
    const coords = geometry.coordinates;
    const type = geometry.type;

    const projectRing = (ring: [number, number][]) => {
      return ring.map((pt, i) => {
        const [px, py] = project(pt, w, h);
        return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
      }).join(' ') + ' Z';
    };

    if (type === 'Polygon') {
      return projectRing(coords[0]);
    } else if (type === 'MultiPolygon') {
      return coords.map((poly: any) => projectRing(poly[0])).join(' ');
    }
    return '';
  };

  // Match visual row to geographic features and gather all metric keys
  const dataMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    data.forEach(d => {
      const cleanLabel = String(d.label || d.name || '').toLowerCase().trim();
      const metricsObj: Record<string, number> = {};
      metricKeys.forEach(k => {
        metricsObj[k] = Number(d[k]) || 0;
      });
      map.set(cleanLabel, metricsObj);
      
      const abbrevKey = String(d.label || d.name || '').toUpperCase();
      if (US_ABBREV_TO_FULL[abbrevKey]) {
        map.set(US_ABBREV_TO_FULL[abbrevKey].toLowerCase(), metricsObj);
      }
      if (WORLD_ALIAS[cleanLabel]) {
        map.set(WORLD_ALIAS[cleanLabel].toLowerCase(), metricsObj);
      }
    });
    return map;
  }, [data, metricKeys]);

  const maxVal = useMemo(() => {
    const vals = data.map(d => Number(d[primaryMetricKey]) || 0);
    return Math.max(...vals, 1);
  }, [data, primaryMetricKey]);

  // Clean metric names from DB aliases (like "value") to the actual metrics selected
  const cleanMetricLabel = (mKey: string) => {
    const rawName = (mKey === 'value' && targetMetricName) ? targetMetricName : mKey;
    return rawName.replace(/[_\-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Drag pan handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden rounded-xl border border-border-custom/25 bg-surface/15"
    >
      
      {/* Premium Floating Controls */}
      <div className="absolute top-3 right-3 z-10 flex space-x-1">
        <button
          onClick={() => setZoom(z => Math.min(8, z + 0.3))}
          className="p-1.5 rounded-lg bg-surface/80 backdrop-blur-xs border border-border-custom/50 hover:border-accent-custom hover:text-text-custom text-muted-custom transition cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.6, z - 0.3))}
          className="p-1.5 rounded-lg bg-surface/80 backdrop-blur-xs border border-border-custom/50 hover:border-accent-custom hover:text-text-custom text-muted-custom transition cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="p-1.5 rounded-lg bg-surface/80 backdrop-blur-xs border border-border-custom/50 hover:border-accent-custom hover:text-text-custom text-muted-custom transition cursor-pointer"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* SVG Canvas Map Area */}
      <div 
        className={`w-full h-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg 
          className="w-full h-full block"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <filter id="premium-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.25" />
            </filter>
            
            <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={isDark ? '#374151' : '#E5E7EB'} strokeWidth="0.5" opacity="0.15" />
            </pattern>
          </defs>

          <rect width="100%" height="100%" fill="url(#grid-pattern)" />

          <g 
            transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            style={{ 
              transformOrigin: `${dimensions.width / 2}px ${dimensions.height / 2}px`, 
              transition: isDragging ? 'none' : 'transform 200ms ease-out' 
            }}
          >
            {features.map((feature, idx) => {
              const name = feature.properties?.name || feature.properties?.STATE_NAME || '';
              const metricsObj = dataMap.get(name.toLowerCase());
              const val = metricsObj ? metricsObj[primaryMetricKey] : 0;
              const pathData = getPathData(feature.geometry, dimensions.width, dimensions.height);
              
              if (!pathData) return null;

              const intensity = maxVal ? val / maxVal : 0;
              const fill = val > 0 
                ? `${color}${Math.floor(40 + intensity * 215).toString(16).padStart(2, '0')}`
                : (isDark ? '#1F2937' : '#E5E7EB');

              return (
                <path
                  key={idx}
                  d={pathData}
                  fill={fill}
                  stroke={isDark ? '#0F172A' : '#FFFFFF'}
                  strokeWidth={val > 0 ? 0.75 / zoom : 0.4 / zoom}
                  filter="url(#premium-shadow)"
                  className="transition-all duration-150 hover:opacity-85 hover:stroke-accent-custom"
                  style={{ cursor: val > 0 ? 'pointer' : 'default' }}
                  onPointerEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    if (containerRect) {
                      setTooltip({
                        x: rect.left - containerRect.left + rect.width / 2,
                        y: rect.top - containerRect.top - 8,
                        title: name,
                        metrics: metricsObj || { [primaryMetricKey]: 0 },
                        visible: true
                      });
                    }
                  }}
                  onPointerLeave={() => setTooltip(null)}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Mouse following detailed glassmorphic tooltip */}
      <AnimatePresence>
        {tooltip && tooltip.visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`absolute pointer-events-none z-30 bg-surface/95 border backdrop-blur-md shadow-2xl flex flex-col ${
              isFullScreen 
                ? 'px-4 py-2.5 rounded-2xl border-accent-custom/50 border-2 text-[12px] space-y-1' 
                : 'px-3 py-2 rounded-xl border-border-custom text-[9px] space-y-0.5 font-mono'
            } text-text-custom`}
            style={{ 
              left: `${tooltip.x}px`, 
              top: `${tooltip.y}px`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <span className={`font-bold text-text-custom border-b border-border-custom/50 pb-0.5 truncate ${isFullScreen ? 'mb-2 text-[13px] max-w-[200px]' : 'mb-1.5 text-[9px] max-w-[140px]'}`}>{tooltip.title}</span>
            {Object.keys(tooltip.metrics).map(mKey => {
              const displayLabel = cleanMetricLabel(mKey);
              return (
                <span key={mKey} className="font-semibold text-accent-custom whitespace-nowrap">
                  {displayLabel}: {formatKpiValue(tooltip.metrics[mKey], mKey, undefined, formatConfig)}
                </span>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend bar at bottom */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center space-x-2 bg-surface/80 border border-border-custom/50 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[8px] font-mono text-muted-custom">
        <span>0</span>
        <div 
          className="w-20 h-2 rounded-full" 
          style={{ background: `linear-gradient(to right, ${color}20, ${color}FF)` }}
        />
        <span>{formatKpiValue(maxVal, undefined, undefined, formatConfig)}</span>
      </div>

    </div>
  );
};
