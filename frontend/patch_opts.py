import re
import sys

path = r"d:\Vizzy Redesign\Vizzy Redesign\frontend\src\pages\user\UserDashboard.tsx"
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace commonOptions definition
old_common = r"""    const commonOptions = \(isScale: boolean, axisLabel: string\) => \(\{
        responsive: true,
        maintainAspectRatio: false,
        onClick: \(e: any, elements: any\[\]\) => \{
            if \(elements.length > 0 && onFilterClick\) \{
                const dataIndex = elements\[0\].index;
                const value = chartData\[dataIndex\]\?\.\[nameKey\];
                if \(value\) onFilterClick\(filterCol, String\(value\)\);
            \}
        \},
        plugins: \{
            legend: \{ display: false \},
            tooltip: \{
                backgroundColor: isDark \? 'rgba\(0,0,0,0.8\)' : 'rgba\(255,255,255,0.9\)',
                titleColor: isDark \? '#fff' : '#000',
                bodyColor: isDark \? '#ccc' : '#333',
                borderColor: isDark \? 'rgba\(255,255,255,0.1\)' : 'rgba\(0,0,0,0.1\)',
                borderWidth: 1,
                callbacks: \{
                    label: \(ctx: any\) => \` \$\{fmtVal\(ctx.raw\)\}\`
                \}
            \}
        \},
        scales: isScale \? \{
            x: \{
                grid: \{ display: false \},
                ticks: \{ color: chartColors.text \}
            \},
            y: \{
                grid: \{ color: chartColors.grid \},
                ticks: \{ color: chartColors.text, callback: \(v: any\) => fmtTick\(v, axisLabel\) \}
            \}
        \} : undefined
    \}\);"""

new_common = """    const commonOptions = (isScale: boolean, axisLabel: string, indexAxis: 'x' | 'y' = 'x', isScatter: boolean = false) => {
        const getTooltipVal = (raw: any) => {
            if (raw === null || raw === undefined) return '';
            if (typeof raw === 'object' && 'y' in raw) return `X: ${fmtTick(raw.x, axisLabel)} Y: ${fmtTick(raw.y, axisLabel)}`;
            return fmtVal(raw);
        };
        
        const tooltipCb = {
            title: (ctxs: any) => ctxs[0].label || '',
            label: (ctx: any) => {
                const label = ctx.dataset.label || chart.value_label || 'Value';
                return ` ${label}: ${getTooltipVal(ctx.raw)}`;
            }
        };

        const standardScales = isScale && indexAxis === 'x' && !isScatter ? {
            x: {
                grid: { display: false },
                ticks: { 
                    color: chartColors.text, 
                    maxRotation: 45, 
                    minRotation: 0,
                    callback: function(val: any, index: number) {
                        // Truncate long labels
                        let label = this.getLabelForValue(val as number);
                        if (typeof label === 'string' && label.length > 18) {
                            return label.substring(0, 18) + '...';
                        }
                        return label;
                    }
                }
            },
            y: {
                grid: { color: chartColors.grid },
                ticks: { color: chartColors.text, callback: (v: any) => fmtTick(v, axisLabel) }
            }
        } : undefined;

        const hbarScales = isScale && indexAxis === 'y' ? {
            x: {
                grid: { color: chartColors.grid },
                ticks: { color: chartColors.text, callback: (v: any) => fmtTick(v, axisLabel) }
            },
            y: {
                grid: { display: false },
                ticks: { color: chartColors.text }
            }
        } : undefined;

        const scatterScales = isScale && isScatter ? {
            x: {
                grid: { display: true, color: chartColors.grid },
                ticks: { color: chartColors.text, callback: (v: any) => fmtTick(v, chart.x_axis || '') }
            },
            y: {
                grid: { color: chartColors.grid },
                ticks: { color: chartColors.text, callback: (v: any) => fmtTick(v, axisLabel) }
            }
        } : undefined;

        return {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (e: any, elements: any[]) => {
                if (elements.length > 0 && onFilterClick) {
                    const dataIndex = elements[0].index;
                    const value = chartData[dataIndex]?.[nameKey];
                    if (value) onFilterClick(filterCol, String(value));
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                    titleColor: isDark ? '#fff' : '#000',
                    bodyColor: isDark ? '#ccc' : '#333',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    bodyFont: { size: 13, family: '"Be Vietnam Pro", sans-serif' },
                    titleFont: { size: 14, weight: 'bold', family: '"Be Vietnam Pro", sans-serif' },
                    callbacks: tooltipCb
                }
            },
            scales: isScale ? (isScatter ? scatterScales : (indexAxis === 'y' ? hbarScales : standardScales)) : undefined
        };
    };"""

text_new = re.sub(old_common, new_common, text, flags=re.MULTILINE | re.DOTALL)

# Update hbar option usage
text_new = re.sub(
    r'options=\{\{\s*\.\.\.commonOptions\(true, chart\.value_label\),\s*indexAxis: \'y\'\s*\} as any\}',
    r"options={{ ...commonOptions(true, chart.value_label, 'y') as any, indexAxis: 'y' } as any}",
    text_new,
    flags=re.MULTILINE | re.DOTALL
)

# Update scatter option usage
text_new = re.sub(
    r'options=\{commonOptions\(true, chart\.y_axis \|\| \'Y\'\) as any\}',
    r"options={commonOptions(true, chart.y_axis || 'Y', 'x', true) as any}",
    text_new
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text_new)

print("Done!" if text_new != text else "Regex didn't match!")
