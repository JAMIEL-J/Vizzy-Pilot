import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ChartRenderer from './ChartRenderer';

// Mock react-chartjs-2 to avoid actual canvas rendering errors during testing
vi.mock('react-chartjs-2', () => ({
  Bar: vi.fn(({ data, options }) => (
    <div data-testid="mock-bar-chart" data-labels={JSON.stringify(data.labels)}>
      {data.datasets.map((ds: any, i: number) => (
        <span key={i} data-testid="dataset-label">{ds.label}</span>
      ))}
    </div>
  )),
  Line: () => <div data-testid="mock-line-chart" />,
  Pie: () => <div data-testid="mock-pie-chart" />,
}));

// Mock useTheme hook
vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    isDark: false,
    setTheme: () => {}
  }),
  ThemeProvider: ({ children }: any) => <div>{children}</div>
}));

describe('ChartRenderer', () => {
  it('formats ISO timestamps cleanly', () => {
    const rawData = {
      x: ['2014-01-01T00:00:00.000', '2014-02-01T00:00:00.000'],
      y: [100, 200]
    };
    render(<ChartRenderer type="bar" data={rawData} />);
    
    const mockBar = screen.getByTestId('mock-bar-chart');
    const labels = JSON.parse(mockBar.getAttribute('data-labels') || '[]');
    expect(labels[0]).toBe('Jan 1, 2014');
    expect(labels[1]).toBe('Feb 1, 2014');
  });

  it('renders a grid of mini HBAR charts for multi-dimensional single-metric datasets', () => {
    const rawData = {
      data: {
        rows: [
          { Segment: 'Consumer', 'Sub-Category': 'Chairs', total_sales: 100 },
          { Segment: 'Consumer', 'Sub-Category': 'Phones', total_sales: 120 },
          { Segment: 'Corporate', 'Sub-Category': 'Chairs', total_sales: 150 },
        ]
      }
    };

    render(<ChartRenderer type="bar" data={rawData} />);
    
    // Should render two mock bars: one for Consumer, one for Corporate
    const mockBars = screen.getAllByTestId('mock-bar-chart');
    expect(mockBars.length).toBe(2);

    // Verify groups (case-sensitive text nodes match, HTML is styled uppercase via Tailwind class)
    expect(screen.getByText('Consumer')).toBeDefined();
    expect(screen.getByText('Corporate')).toBeDefined();
  });
});
