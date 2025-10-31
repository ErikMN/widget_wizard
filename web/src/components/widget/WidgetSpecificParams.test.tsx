/**
 * WIP: Unit tests for WidgetSpecificParams
 *
 * How to run:
 *   - One-off:  yarn vitest
 *   - Watch:    yarn vitest watch
 *
 * Notes:
 * - We use Vitest fake timers to flush the component's lodash.debounce (500ms).
 * - We mock useGlobalContext to provide schema and capture updateWidget calls.
 */
import WidgetSpecificParams from './WidgetSpecificParams';
import { useGlobalContext } from '../GlobalContext';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { vi } from 'vitest';

/* Mock global context */
vi.mock('../GlobalContext', () => ({
  useGlobalContext: vi.fn()
}));

const mockUpdateWidget = vi.fn();

const baseWidget = {
  generalParams: { type: 'testWidget' },
  widgetParams: {
    points: [
      { x: -50, y: 0 },
      { x: 0.5, y: 20 }
    ],
    curves: [
      [
        { x: -200, y: 50 },
        { x: -100, y: 50 },
        { x: -50, y: 50 }
      ],
      [
        { x: -50, y: 50 },
        { x: -30, y: 70 },
        { x: 0, y: 50 }
      ]
    ]
  }
} as any;

const widgetCapabilities = {
  data: {
    widgets: [
      {
        type: 'testWidget',
        widgetParams: {
          points: {
            type: 'array',
            value: {
              x: { type: 'float' },
              y: { type: 'float' }
            }
          },
          curves: {
            type: 'array',
            value: {
              type: 'array',
              value: {
                x: { type: 'float' },
                y: { type: 'float' }
              }
            }
          }
        }
      }
    ]
  }
};

(useGlobalContext as unknown as vi.Mock).mockReturnValue({
  widgetCapabilities,
  updateWidget: mockUpdateWidget,
  appSettings: { debug: false }
});

describe('WidgetSpecificParams (renderArrayInput)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateWidget.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders array-of-objects: points', () => {
    render(<WidgetSpecificParams widget={baseWidget} />);
    expect(screen.getByText('Widget parameters')).toBeInTheDocument();
    expect(screen.getByText('Points')).toBeInTheDocument();

    // Should render numeric inputs (x/y fields)
    const nums = screen.getAllByRole('spinbutton');
    expect(nums.length).toBeGreaterThan(0);
  });

  it('renders array-of-arrays: curves (outer and inner)', () => {
    render(<WidgetSpecificParams widget={baseWidget} />);

    // Outer array label
    expect(screen.getByText('Curves')).toBeInTheDocument();

    // Inner arrays rendered with recursive labels like "Curves 1"
    expect(screen.getByText(/Curves 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Curves 2/i)).toBeInTheDocument();

    // Numeric inputs for inner points exist
    const nums = screen.getAllByRole('spinbutton');
    expect(nums.length).toBeGreaterThan(0);
  });

  it('adds a new item to points (increases item count)', () => {
    render(<WidgetSpecificParams widget={baseWidget} />);

    // Count all "Item N" labels before
    const before = screen.getAllByText(/Item \d+/i).length;

    // First "Add item" typically belongs to "Points"
    const addButtons = screen.getAllByRole('button', { name: /Add item/i });
    fireEvent.click(addButtons[0]);

    // Count again; should have increased
    const after = screen.getAllByText(/Item \d+/i).length;
    expect(after).toBeGreaterThan(before);
  });

  it('removes an item from points (decreases item count)', () => {
    render(<WidgetSpecificParams widget={baseWidget} />);

    const before = screen.getAllByText(/Item \d+/i).length;
    const removeButtons = screen
      .getAllByRole('button', { name: '' })
      .filter((b) => b.querySelector('svg[data-testid="CloseIcon"]'));

    fireEvent.click(removeButtons[0]); // click first remove X

    const after = screen.getAllByText(/Item \d+/i).length;
    expect(after).toBeLessThan(before);
  });

  it('adds a new inner array for curves (increases number of item cards inside curves)', () => {
    render(<WidgetSpecificParams widget={baseWidget} />);

    // Count total "Item N" cards before
    const beforeItems = screen.getAllByText(/Item \d+/i).length;

    // "Curves" block's Add item button is second in schema
    const addButtons = screen.getAllByRole('button', { name: /Add item/i });
    const curvesAddButton = addButtons[1];
    fireEvent.click(curvesAddButton);

    // After click, more item cards should exist
    const afterItems = screen.getAllByText(/Item \d+/i).length;
    expect(afterItems).toBeGreaterThan(beforeItems);
  });

  it('clicking Update triggers debounced updateWidget', async () => {
    render(<WidgetSpecificParams widget={baseWidget} />);

    const updateButtons = screen.getAllByRole('button', { name: /Update/i });

    // Click Update for the first block
    fireEvent.click(updateButtons[0]);

    // Debounce is 500ms; flush timers
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(mockUpdateWidget).toHaveBeenCalledTimes(1);
    expect(mockUpdateWidget.mock.calls[0][0]).toMatchObject({
      widgetParams: expect.any(Object)
    });
  });
});
