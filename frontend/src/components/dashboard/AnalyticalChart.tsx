import React from "react";

interface ChartPoint {
  label: string;
  value: number;
}

interface AnalyticalChartProps {
  key?: string | number;
  id: string;
  title: string;
  type: string;
  description: string;
  metricLabel: string;
  data: ChartPoint[];
  groupIdx: number;
  clickedFilterKey: string | null;
  clickedFilterVal: string | null;
  onPointClick: (label: string, chartId: string) => void;
}

export default function AnalyticalChart({
  id,
  title,
  type,
  description,
  metricLabel,
  data,
  groupIdx,
  clickedFilterKey,
  clickedFilterVal,
  onPointClick,
}: AnalyticalChartProps) {
  // Helpers for determining active highlights
  const isSelectedPoint = (label: string) => {
    return (
      (clickedFilterKey === "region" && label === clickedFilterVal) ||
      (clickedFilterKey === "plan" && label === clickedFilterVal) ||
      (clickedFilterKey === "category" && label === clickedFilterVal) ||
      (clickedFilterKey === "churnRisk" && label === clickedFilterVal) ||
      (!!clickedFilterKey && label === clickedFilterVal)
    );
  };

  // Group theme colors
  const themeColors = [
    { primary: "rgb(79, 70, 229)", secondary: "rgba(79, 70, 229, 0.15)", hoverHex: "#4f46e5", stroke: "#312e81" }, // indigo
    { primary: "rgb(147, 51, 234)", secondary: "rgba(147, 51, 234, 0.15)", hoverHex: "#9333ea", stroke: "#4c1d95" }, // purple
    { primary: "rgb(16, 185, 129)", secondary: "rgba(16, 185, 129, 0.15)", hoverHex: "#10b981", stroke: "#064e3b" }, // emerald
    { primary: "rgb(59, 130, 246)", secondary: "rgba(59, 130, 246, 0.15)", hoverHex: "#3b82f6", stroke: "#1e3a8a" }, // blue
    { primary: "rgb(20, 184, 166)", secondary: "rgba(20, 184, 166, 0.15)", hoverHex: "#14b8a6", stroke: "#115e59" }, // teal
  ];

  const currentTheme = themeColors[groupIdx % themeColors.length];

  // Global aggregate value sum
  const values = data.map((d) => Math.abs(d.value));
  const maxVal = Math.max(...values, 1);
  const totalVal = values.reduce((sum, curr) => sum + curr, 0) || 1;

  // Render method based on chart type
  const renderChartGraphic = () => {
    const chartTypeNormalized = type.toLowerCase();

    // 1. VERTICAL BAR CHART
    if (chartTypeNormalized === "bar") {
      const height = 110;
      const width = 280;
      const paddingLeft = 32;
      const paddingRight = 10;
      const paddingTop = 20;
      const paddingBottom = 22;

      const chartWidth = width - paddingLeft - paddingRight;
      const chartHeight = height - paddingTop - paddingBottom;

      const barWidth = Math.max(16, (chartWidth / data.length) * 0.50);
      const gap = (chartWidth - barWidth * data.length) / Math.max(1, data.length - 1);

      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[145px] overflow-visible select-none">
          <defs>
            <linearGradient id={`barGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentTheme.primary} stopOpacity="1" />
              <stop offset="100%" stopColor={currentTheme.primary} stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id={`barSelectedGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.5" />
            </linearGradient>
            <filter id={`shadow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#1F1C18" floodOpacity="0.06" />
            </filter>
          </defs>

          {/* Grids */}
          {[0, 0.5, 1].map((ratio, index) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const gridVal = maxVal * ratio;
            return (
              <g key={index} className="opacity-40">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#E4DED4"
                  strokeWidth="0.75"
                  strokeDasharray="3,3"
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 2.5}
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                  fontSize="6.5"
                  className="tracking-tight"
                  fill="#7C725D"
                  textAnchor="end"
                >
                  {gridVal >= 1000 ? `${(gridVal / 1000).toFixed(0)}k` : gridVal.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((point, idx) => {
            const x = paddingLeft + idx * (barWidth + gap);
            const barHeight = (Math.abs(point.value) / maxVal) * chartHeight;
            const y = paddingTop + chartHeight - barHeight;
            const isSelected = isSelectedPoint(point.label);
            const isAnyActive = clickedFilterVal !== null;

            return (
              <g
                key={idx}
                className="cursor-pointer group/node"
                onClick={() => onPointClick(point.label, id)}
              >
                {/* Visual Glow Layer */}
                <circle
                  cx={x + barWidth / 2}
                  cy={y + barHeight / 2}
                  r={barWidth + 4}
                  fill="transparent"
                  className="transition-all duration-300 group-hover/node:fill-black/[0.03]"
                />
                {/* Main bar with elegant gradient & rounded corners */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(4, barHeight)}
                  rx={3}
                  fill={isSelected ? `url(#barSelectedGrad-${id})` : isAnyActive ? `${currentTheme.primary}70` : `url(#barGrad-${id})`}
                  filter={`url(#shadow-${id})`}
                  className="transition-all duration-300 group-hover/node:stroke-amber-400 group-hover/node:stroke-1"
                />
                {/* Active value indicator above bar */}
                <g className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-250 pointer-events-none">
                  <rect
                    x={x + barWidth / 2 - 20}
                    y={y - 14}
                    width="40"
                    height="10"
                    rx="2.5"
                    fill="#1F1C18"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 7}
                    fontFamily="Inter, sans-serif"
                    fontSize="6"
                    fill="#FCFAF5"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {point.value >= 1000 ? `${(point.value / 1000).toFixed(1)}k` : point.value}
                  </text>
                </g>
                {/* Axis Label */}
                <text
                  x={x + barWidth / 2}
                  y={height - 5}
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                  fontSize="6.5"
                  fill="#7C725D"
                  textAnchor="middle"
                  className="group-hover/node:fill-black truncate transition-colors duration-200"
                >
                  {point.label.substring(0, 5)}
                </text>
              </g>
            );
          })}

          {/* Baseline */}
          <line
            x1={paddingLeft}
            y1={paddingTop + chartHeight}
            x2={width - paddingRight}
            y2={paddingTop + chartHeight}
            stroke="#7C725D"
            strokeWidth="1"
            className="opacity-60"
          />
        </svg>
      );
    }

    // 2. LINE / AREA CHART
    if (chartTypeNormalized === "line" || chartTypeNormalized === "area") {
      const height = 110;
      const width = 280;
      const paddingLeft = 32;
      const paddingRight = 10;
      const paddingTop = 20;
      const paddingBottom = 22;

      const chartWidth = width - paddingLeft - paddingRight;
      const chartHeight = height - paddingTop - paddingBottom;

      const pointsCount = data.length;
      const stepX = chartWidth / Math.max(1, pointsCount - 1);

      // Map data elements to X, Y coordinates
      const coords = data.map((point, idx) => {
        const x = paddingLeft + idx * stepX;
        const y = paddingTop + chartHeight - (Math.abs(point.value) / maxVal) * chartHeight;
        return { x, y, label: point.label, rawValue: point.value };
      });

      // Build SVG Path strings
      const linePath = coords.reduce((acc, c, idx) => {
        return idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`;
      }, "");

      const areaPath = coords.length > 0 
        ? `${linePath} L ${coords[coords.length - 1].x} ${paddingTop + chartHeight} L ${coords[0].x} ${paddingTop + chartHeight} Z`
        : "";

      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[145px] overflow-visible select-none">
          <defs>
            <linearGradient id={`polyGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentTheme.primary} stopOpacity="0.45" />
              <stop offset="100%" stopColor={currentTheme.primary} stopOpacity="0.00" />
            </linearGradient>
            <linearGradient id={`lineGrad-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={currentTheme.primary} />
              <stop offset="100%" stopColor={currentTheme.hoverHex} />
            </linearGradient>
            <linearGradient id="selectedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
            <filter id={`lineGlow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor={currentTheme.primary} floodOpacity="0.12" />
            </filter>
          </defs>

          {/* Parallel grids */}
          {[0, 0.5, 1].map((ratio, index) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const gridVal = maxVal * ratio;
            return (
              <g key={index} className="opacity-30">
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#E4DED4" strokeWidth="0.75" />
                <text 
                  x={paddingLeft - 6} 
                  y={y + 2.5} 
                  fontFamily="Inter, sans-serif" 
                  fontWeight="600"
                  fontSize="6.5" 
                  fill="#7C725D" 
                  textAnchor="end"
                >
                  {gridVal >= 1000 ? `${(gridVal / 1000).toFixed(0)}k` : gridVal.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Area under the curve */}
          {coords.length > 0 && (
            <path
              d={areaPath}
              fill={`url(#polyGrad-${id})`}
              className="transition-all duration-300 pointer-events-none"
            />
          )}

          {/* Line stroke */}
          {coords.length > 0 && (
            <path
              d={linePath}
              fill="none"
              stroke={`url(#lineGrad-${id})`}
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#lineGlow-${id})`}
              className="transition-all duration-300 pointer-events-none"
            />
          )}

          {/* Interaction Circles inside coordinates */}
          {coords.map((c, idx) => {
            const isSelected = isSelectedPoint(c.label);
            return (
              <g
                key={idx}
                className="cursor-pointer group/node"
                onClick={() => onPointClick(c.label, id)}
              >
                {/* Active Outer Circle Ring */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 6.5 : 4}
                  fill={isSelected ? "#f59e0b" : "white"}
                  stroke={isSelected ? "#b45309" : currentTheme.primary}
                  strokeWidth="2"
                  className="transition-all duration-300 group-hover/node:fill-amber-400 group-hover/node:r-6"
                />
                
                {/* Mini Center Core Indicator */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r="1.5"
                  fill="white"
                  className="pointer-events-none"
                />

                {/* Individual coordinates text label on hover */}
                <g className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <rect
                    x={c.x - 25}
                    y={c.y - 18}
                    width="50"
                    height="12"
                    fill="#1F1C18"
                    rx="2.5"
                  />
                  <text
                    x={c.x}
                    y={c.y - 10}
                    fontFamily="Inter, sans-serif"
                    fontSize="6"
                    fontWeight="bold"
                    fill="white"
                    textAnchor="middle"
                  >
                    {c.rawValue >= 1000 ? `${(c.rawValue / 1000).toFixed(1)}k` : c.rawValue.toFixed(0)}
                  </text>
                </g>

                {/* Bottom X-axis labels */}
                <text
                  x={c.x}
                  y={height - 5}
                  fontFamily="Inter, sans-serif"
                  fontWeight="600"
                  fontSize="6.5"
                  fill="#7C725D"
                  textAnchor="middle"
                  className="group-hover/node:fill-black truncate transition-colors duration-200"
                >
                  {c.label.substring(0, 5)}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    // 3. PIE CHART or DONUT CHART or GAUGE
    if (chartTypeNormalized === "pie" || chartTypeNormalized === "donut" || chartTypeNormalized === "gauge") {
      const height = 110;
      const width = 280;
      const cx = 72;
      const cy = 55;
      const r = 40;
      const innerRadius = chartTypeNormalized === "pie" ? 0 : 25;
      const paddingTop = 15;

      // Calculate slice angles
      let cumulativePercent = 0;

      // Visual sectors generator
      const sectors = data.map((point) => {
        const percent = Math.abs(point.value) / totalVal;
        const startPercent = cumulativePercent;
        cumulativePercent += percent;
        return {
          point,
          percent,
          startPercent,
          endPercent: cumulativePercent,
        };
      });

      // Transform angles into polar coordinates
      const getPolarCoordinates = (centerX: number, centerY: number, radius: number, percent: number) => {
        const angleInRadians = (percent * 360 - 90) * (Math.PI / 180);
        return {
          x: centerX + radius * Math.cos(angleInRadians),
          y: centerY + radius * Math.sin(angleInRadians),
        };
      };

      // Custom discrete color palettes for pie segments
      const segmentColors = [
        currentTheme.primary,
        `${currentTheme.primary}dd`,
        `${currentTheme.primary}bb`,
        `${currentTheme.primary}99`,
        `${currentTheme.primary}77`,
        `${currentTheme.primary}55`,
      ];

      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[145px] overflow-visible select-none">
          <defs>
            <filter id={`donutShadow-${id}`} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#1F1C18" floodOpacity="0.08" />
            </filter>
          </defs>

          <g filter={`url(#donutShadow-${id})`}>
            {sectors.map((sec, idx) => {
              const isSelected = isSelectedPoint(sec.point.label);
              
              // Handle edge case of 100% slice or empty slices
              const angleDelta = (sec.endPercent - sec.startPercent) * 360;
              if (angleDelta <= 0) return null;
              if (angleDelta >= 359.9) {
                return (
                  <g key={idx} className="cursor-pointer group/node" onClick={() => onPointClick(sec.point.label, id)}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={isSelected ? "#f59e0b" : segmentColors[0]}
                      strokeWidth={r - innerRadius}
                      className="transition-all duration-300 group-hover/node:stroke-amber-400"
                    />
                  </g>
                );
              }

              const startOuter = getPolarCoordinates(cx, cy, r, sec.startPercent);
              const endOuter = getPolarCoordinates(cx, cy, r, sec.endPercent);
              const startInner = getPolarCoordinates(cx, cy, innerRadius, sec.startPercent);
              const endInner = getPolarCoordinates(cx, cy, innerRadius, sec.endPercent);

              const largeArcFlag = angleDelta > 180 ? 1 : 0;

              // Generate SVG path for Donut / Pie segment slice
              const pathData = `
                M ${startOuter.x} ${startOuter.y}
                A ${r} ${r} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}
                L ${endInner.x} ${endInner.y}
                A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}
                Z
              `;

              // Calculate center point of current arc sector for placing labels text
              const textPercent = sec.startPercent + sec.percent / 2;
              const textCoords = getPolarCoordinates(cx, cy, innerRadius + (r - innerRadius) / 2 + 1, textPercent);

              return (
                <g
                  key={idx}
                  className="cursor-pointer group/node"
                  onClick={() => onPointClick(sec.point.label, id)}
                >
                  {/* Slice segment path */}
                  <path
                    d={pathData}
                    fill={isSelected ? "#f59e0b" : segmentColors[idx % segmentColors.length]}
                    stroke="#FCFAF5"
                    strokeWidth="1.25"
                    className="transition-all duration-300 group-hover/node:fill-amber-500"
                  />

                  {/* Inside Category Segment Label text (only if segment is big enough) */}
                  {sec.percent > 0.12 && (
                    <text
                      x={textCoords.x}
                      y={textCoords.y + 2}
                      fontSize="5.5"
                      fontFamily="Inter, sans-serif"
                      fontWeight="bold"
                      fill={isSelected ? "#78350f" : "white"}
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {`${(sec.percent * 100).toFixed(0)}%`}
                    </text>
                  )}

                  {/* Hover interactive mini-readout in center */}
                  <g className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-250 pointer-events-none">
                    <circle cx={cx} cy={cy} r={innerRadius - 0.5} fill="#1F1C18" />
                    <text x={cx} y={cy - 4} fontSize="5" fontFamily="Inter, sans-serif" fill="#7C725D" textAnchor="middle" fontWeight="bold" className="uppercase tracking-wider">
                      {sec.point.label.substring(0, 8)}
                    </text>
                    <text x={cx} y={cy + 4.5} fontSize="7" fontFamily="Inter, sans-serif" fill="white" fontWeight="900" textAnchor="middle">
                      {sec.point.value >= 1000 ? `${(sec.point.value / 1000).toFixed(1)}k` : sec.point.value}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* Central Donut Blank Core Label if donut and no hover */}
          {chartTypeNormalized === "donut" && (
            <circle cx={cx} cy={cy} r={innerRadius - 2} fill="#FCFAF5" className="pointer-events-none" />
          )}

          {/* Core total metrics indicator labeled inside */}
          {chartTypeNormalized === "donut" && (
            <g className="pointer-events-none">
              <text x={cx} y={cy - 2} fontSize="4.5" fontFamily="Inter, sans-serif" fill="#7C725D" fontWeight="bold" textAnchor="middle" className="uppercase tracking-widest leading-none">
                KPI TOTAL
              </text>
              <text x={cx} y={cy + 6} fontSize="7.5" fontFamily="Inter, sans-serif" fill="#1F1C18" fontWeight="900" textAnchor="middle">
                {totalVal >= 100000 ? `${(totalVal / 1000).toFixed(0)}k` : totalVal.toLocaleString()}
              </text>
            </g>
          )}

          {/* HIGH-FIDELITY ALIGNED LEGEND GRID ON RIGHT */}
          <g className="font-sans text-[7.5px]" fill="#1F1C18">
            {data.slice(0, 5).map((pt, index) => {
              const rectY = paddingTop + index * 16 - 2;
              const swatchColor = segmentColors[index % segmentColors.length];
              const isSelected = isSelectedPoint(pt.label);
              const percentageString = `${((Math.abs(pt.value) / totalVal) * 100).toFixed(0)}%`;

              return (
                <g 
                  key={index} 
                  className="cursor-pointer group/legend-row transition-all duration-200"
                  onClick={() => onPointClick(pt.label, id)}
                >
                  {/* Row hover guide */}
                  <rect 
                    x="132" 
                    y={rectY - 3} 
                    width="145" 
                    height="14" 
                    rx="2" 
                    fill={isSelected ? "rgba(245,158,11,0.08)" : "transparent"} 
                    stroke={isSelected ? "#f59e0b" : "transparent"}
                    strokeOpacity="0.25"
                    strokeWidth="0.5"
                    className="group-hover/legend-row:fill-black/[0.02]" 
                  />

                  {/* Swatch color bubble */}
                  <rect 
                    x="136" 
                    y={rectY} 
                    width="6" 
                    height="6" 
                    rx="1.5" 
                    fill={isSelected ? "#f59e0b" : swatchColor} 
                  />

                  {/* Bullet Category text key */}
                  <text 
                    x="147" 
                    y={rectY + 5.5} 
                    fontWeight="600" 
                    fontFamily="Inter, sans-serif"
                    fill={isSelected ? "#b45309" : "#1F1C18"}
                  >
                    {pt.label.length > 14 ? `${pt.label.substring(0, 13)}…` : pt.label}
                  </text>

                  {/* Right hand details key tabular alignments */}
                  <text 
                    x="240" 
                    y={rectY + 5.5} 
                    fontWeight="700" 
                    fontFamily="Space Grotesk, Inter, sans-serif"
                    textAnchor="end"
                    fill={isSelected ? "#b45309" : "#4A453A"}
                  >
                    {pt.value >= 1000 ? `${(pt.value/1000).toFixed(1)}k` : pt.value}
                  </text>

                  <text 
                    x="272" 
                    y={rectY + 5.5} 
                    fontWeight="800"
                    fontFamily="Inter, sans-serif"
                    className="font-mono"
                    textAnchor="end"
                    fill={isSelected ? "#b45309" : "#7C725D"}
                  >
                    {percentageString}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      );
    }

    // 4. RADAR CHART
    if (chartTypeNormalized === "radar") {
      const height = 110;
      const width = 280;
      const cx = 140;
      const cy = 54;
      const r = 40;

      const pointsCount = data.length;
      const angleStep = (2 * Math.PI) / pointsCount;

      const getRadarCoordinates = (cx: number, cy: number, radius: number, angleIndex: number) => {
        const currentAngle = angleStep * angleIndex - Math.PI / 2;
        return {
          x: cx + radius * Math.cos(currentAngle),
          y: cy + radius * Math.sin(currentAngle),
        };
      };

      // Draw standard web grid layers
      const gridLevels = [0.25, 0.5, 0.75, 1.0];

      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[145px] overflow-visible select-none">
          {/* Radial grid spokes radiating from center */}
          {Array.from({ length: pointsCount }).map((_, idx) => {
            const edge = getRadarCoordinates(cx, cy, r, idx);
            return (
              <line
                key={`spoke-${idx}`}
                x1={cx}
                y1={cy}
                x2={edge.x}
                y2={edge.y}
                stroke="#E4DED4"
                strokeWidth="0.75"
                strokeDasharray="2,2"
                className="opacity-80"
              />
            );
          })}

          {/* Web grid outline layers */}
          {gridLevels.map((lvl, lvlIdx) => {
            const levelRadius = r * lvl;
            const pointsString = Array.from({ length: pointsCount })
              .map((_, idx) => {
                const coord = getRadarCoordinates(cx, cy, levelRadius, idx);
                return `${coord.x},${coord.y}`;
              })
              .join(" ");

            return (
              <polygon
                key={lvlIdx}
                points={pointsString}
                fill="none"
                stroke="#E4DED4"
                strokeWidth="0.5"
                className="opacity-80"
              />
            );
          })}

          {/* Actual Multivariable Metric Filled Polygon */}
          {(() => {
            const pointsString = data
              .map((point, idx) => {
                const score = Math.abs(point.value) / maxVal;
                const valueRadius = r * Math.max(0.12, score);
                const coord = getRadarCoordinates(cx, cy, valueRadius, idx);
                return `${coord.x},${coord.y}`;
              })
              .join(" ");

            return (
              <polygon
                points={pointsString}
                fill={`${currentTheme.primary}22`}
                stroke={currentTheme.primary}
                strokeWidth="2.5"
                className="transition-all duration-300 pointer-events-none"
              />
            );
          })()}

          {/* Interaction Dot Nodes plotted along coordinates */}
          {data.map((point, idx) => {
            const score = Math.abs(point.value) / maxVal;
            const valueRadius = r * Math.max(0.12, score);
            const { x, y } = getRadarCoordinates(cx, cy, valueRadius, idx);
            const isSelected = isSelectedPoint(point.label);

            // Calculate textual label displacement offsets around center (more displacement to breathe)
            const labelCoords = getRadarCoordinates(cx, cy, r + 13, idx);

            return (
              <g
                key={idx}
                className="cursor-pointer group/node"
                onClick={() => onPointClick(point.label, id)}
              >
                {/* Visual Dot */}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 5.5 : 3.5}
                  fill={isSelected ? "#f59e0b" : "white"}
                  stroke={isSelected ? "#b45309" : currentTheme.stroke || currentTheme.primary}
                  strokeWidth="1.5"
                  className="transition-all duration-300 group-hover/node:fill-amber-400 group-hover/node:r-5"
                />

                {/* Radar vertex description keys */}
                <text
                  x={labelCoords.x}
                  y={labelCoords.y + 2.5}
                  fontFamily="Inter, sans-serif"
                  fontSize="6.5"
                  fill="#4A453A"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {point.label.substring(0, 10)}
                </text>

                {/* Micro tooltip readout */}
                <g className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <rect x={x - 22} y={y - 13} width="44" height="10" fill="#1F1C18" rx="2" />
                  <text x={x} y={y - 6} fontSize="5.5" fontFamily="Inter, sans-serif" fill="white" fontWeight="bold" textAnchor="middle">
                    {point.value >= 1000 ? `${(point.value/1000).toFixed(1)}k` : point.value}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      );
    }

    // DEFAULT CORES: PREMIUM MULTI-METRIC HORIZONTAL PROGRESS BARS (HBAR / fallback)
    return (
      <div className="my-3 space-y-2 select-none">
        {data.map((point, pIdx) => {
          const pct = Math.min(100, Math.max(8, (Math.abs(point.value) / maxVal) * 100));
          const isSelected = isSelectedPoint(point.label);

          return (
            <div
              key={pIdx}
              onClick={() => onPointClick(point.label, id)}
              className="cursor-pointer group/bar space-y-1"
            >
              <div className="flex items-center justify-between text-[10px] font-mono text-[#7C725D]">
                <span className="truncate max-w-[110px] font-bold group-hover/bar:text-gray-950">
                  {point.label}
                </span>
                <span className="font-extrabold text-gray-950 font-mono">
                  {point.value >= 1000 ? `$${point.value.toLocaleString()}` : point.value}
                </span>
              </div>
              
              {/* SVG gradient track representation */}
              <div className="h-2 w-full rounded-xs bg-[#E4DED4]/40 overflow-hidden relative border border-[#E4DED4]/20">
                <div
                  className={`h-full rounded-xs transition-all duration-500 ${
                    isSelected
                      ? "bg-amber-500"
                      : groupIdx === 0
                      ? "bg-gradient-to-r from-indigo-700 to-indigo-900"
                      : groupIdx === 1
                      ? "bg-gradient-to-r from-blue-700 to-blue-900"
                      : groupIdx === 2
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-800"
                      : groupIdx === 3
                      ? "bg-gradient-to-r from-blue-700 to-blue-900"
                      : "bg-gradient-to-r from-teal-600 to-teal-800"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-5.5 rounded-2xl border border-[#E4DED4] bg-[#FCFAF5] hover:border-[#1F1C18] hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between h-[310px] relative overflow-hidden group/card shadow-sm">
      <div>
        {/* Dynamic header row details */}
        <div className="flex items-start justify-between gap-1.5 border-b border-[#E4DED4]/25 pb-2">
          <span className="text-[11px] font-sans font-bold tracking-tight text-gray-900 leading-tight group-hover:text-emerald-900 uppercase">
            {title}
          </span>
          <span className="font-mono text-[8px] text-[#7C725D] shrink-0 font-extrabold bg-[#E4DED4]/40 px-1.5 py-0.5 rounded uppercase">
            {type}
          </span>
        </div>
        <p className="text-[9.5px] text-[#7C725D] font-sans leading-snug mt-1.5 line-clamp-2">
          {description}
        </p>
      </div>

      {/* Render selected canvas visual representation */}
      <div className="my-1.5 flex-1 flex flex-col justify-center">
        {renderChartGraphic()}
      </div>

      {/* Footer statistics keys */}
      <div className="text-[8.5px] font-mono text-[#7C725D] border-t border-[#E4DED4]/30 pt-1.5 flex items-center justify-between">
        <span>SLA Level Indicator:</span>
        <span className="uppercase font-extrabold text-[#1F1C18]">{metricLabel}</span>
      </div>
    </div>
  );
}
