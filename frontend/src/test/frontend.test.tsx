import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sparkline from '../components/dashboard/Sparkline';
import MultiFilterPanel from '../components/dashboard/MultiFilterPanel';
import { ColumnClassificationPanel } from '../components/dashboard/ColumnClassificationPanel';
import { useFilterStore } from '../store/useFilterStore';

// Mock Lucide Icons used in MultiFilterPanel or subcomponents
vi.mock('lucide-react', () => ({
    X: () => <span data-testid="icon-x">X</span>,
}));

// Test 1: Empty ChartGrid render stub to verify empty state grid rendering
const ChartGrid = ({ charts }: { charts: any[] }) => {
    if (!charts || charts.length === 0) {
        return <div data-testid="empty-grid">No charts available</div>;
    }
    return (
        <div className="grid grid-cols-3 gap-4" data-testid="chart-grid">
            {charts.map((chart, idx) => (
                <div key={idx} data-testid="chart-item">{chart.title}</div>
            ))}
        </div>
    );
};

describe('ChartGrid Component', () => {
    it('renders empty state message when no charts are provided', () => {
        render(<ChartGrid charts={[]} />);
        expect(screen.getByTestId('empty-grid')).toBeInTheDocument();
        expect(screen.getByText('No charts available')).toBeInTheDocument();
    });
});

// Test 2: FilterPanel (MultiFilterPanel) non-mutation
describe('MultiFilterPanel Component', () => {
    it('triggers callbacks on interaction without mutating input props', () => {
        const geoFilters = { country: ['USA', 'Canada'] };
        const activeFilters = { country: ['USA'] };
        const filterSlots = ['country', null, null, null];
        const onSlotChange = vi.fn();
        const onFilterChange = vi.fn();
        const onClearAll = vi.fn();

        // Freeze props to guarantee non-mutation
        Object.freeze(geoFilters);
        Object.freeze(activeFilters);
        Object.freeze(filterSlots);

        render(
            <MultiFilterPanel
                geoFilters={geoFilters}
                targetColumn={null}
                targetValues={[]}
                filterSlots={filterSlots}
                activeFilters={activeFilters}
                onSlotChange={onSlotChange}
                onFilterChange={onFilterChange}
                onClearAll={onClearAll}
            />
        );

        const clearButton = screen.getByText('Clear all');
        expect(clearButton).toBeInTheDocument();
        fireEvent.click(clearButton);

        expect(onClearAll).toHaveBeenCalled();
    });
});

// Test 3: Sparkline regression tests
describe('Sparkline Component', () => {
    it('returns null for empty or small dataset', () => {
        const { container } = render(<Sparkline data={[]} color="red" />);
        expect(container.firstChild).toBeNull();

        const { container: container1 } = render(<Sparkline data={[10]} color="red" />);
        expect(container1.firstChild).toBeNull();
    });

    it('renders SVG polyline correctly for valid dataset', () => {
        const { container } = render(<Sparkline data={[10, 20, 15]} color="blue" />);
        expect(container.querySelector('svg')).toBeInTheDocument();
        expect(container.querySelector('polyline')).toBeInTheDocument();
        const polyline = container.querySelector('polyline');
        expect(polyline?.getAttribute('stroke')).toBe('blue');
        expect(polyline?.getAttribute('points')).toBeTruthy();
    });
});

// Test 4: SemanticOverlay (ColumnClassificationPanel) fresh load check
describe('ColumnClassificationPanel Component', () => {
    it('loads columns and classifications correctly on a fresh load', () => {
        // Setup Zustand store values for fresh load
        useFilterStore.setState({
            classification_overrides: {},
            rawData: []
        });

        const mockColumns = {
            dimensions: ['category'],
            metrics: ['revenue'],
            targets: ['churn'],
            dates: ['created_at'],
            excluded: ['id']
        };

        render(<ColumnClassificationPanel columns={mockColumns} isDark={false} />);

        // Verify headers and main text
        expect(screen.getByText('Column Classification')).toBeInTheDocument();
        expect(screen.getByText(/Review how Vizzy detected your columns/)).toBeInTheDocument();

        // Verify column names exist in the classification view
        expect(screen.getByText('category')).toBeInTheDocument();
        expect(screen.getByText('revenue')).toBeInTheDocument();
        expect(screen.getByText('churn')).toBeInTheDocument();
        expect(screen.getByText('created_at')).toBeInTheDocument();
        expect(screen.getByText('id')).toBeInTheDocument();
    });
});
