import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SqlEditor from '../components/chat/SqlEditor';

vi.mock('lucide-react', () => ({
    Code2: () => <span data-testid="icon-code">c</span>,
    Copy: () => <span data-testid="icon-copy">cp</span>,
    Check: () => <span data-testid="icon-check">ok</span>,
    Play: () => <span data-testid="icon-play">p</span>,
    X: () => <span data-testid="icon-x">x</span>,
    AlertCircle: () => <span data-testid="icon-alert">!</span>,
}));

describe('SqlEditor', () => {
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);

    beforeAll(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
    });

    afterAll(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: originalClipboard,
        });
    });

    beforeEach(() => {
        writeText.mockClear();
    });

    it('renders the SQL preview and an Edit button by default', () => {
        render(<SqlEditor messageId="m1" sql="SELECT 1" onExecute={vi.fn()} />);

        expect(screen.getByTestId('sql-preview')).toHaveTextContent('SELECT 1');
        expect(screen.getByTestId('sql-edit-button')).toBeInTheDocument();
        expect(screen.queryByTestId('sql-run-button')).not.toBeInTheDocument();
    });

    it('Edit transitions into editing mode with a pre-filled textarea', () => {
        render(<SqlEditor messageId="m1" sql="SELECT 1" onExecute={vi.fn()} />);

        fireEvent.click(screen.getByTestId('sql-edit-button'));

        const textarea = screen.getByTestId('sql-textarea') as HTMLTextAreaElement;
        expect(textarea).toBeInTheDocument();
        expect(textarea.value).toBe('SELECT 1');
        expect(screen.getByTestId('sql-run-button')).toBeInTheDocument();
        expect(screen.queryByTestId('sql-edit-button')).not.toBeInTheDocument();
    });

    it('Cancel restores the original SQL and exits editing mode', () => {
        render(<SqlEditor messageId="m1" sql="SELECT 1" onExecute={vi.fn()} />);

        fireEvent.click(screen.getByTestId('sql-edit-button'));
        const textarea = screen.getByTestId('sql-textarea') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'SELECT garbage' } });
        expect(textarea.value).toBe('SELECT garbage');

        fireEvent.click(screen.getByTestId('sql-cancel-button'));

        expect(screen.queryByTestId('sql-textarea')).not.toBeInTheDocument();
        expect(screen.getByTestId('sql-edit-button')).toBeInTheDocument();
        expect(screen.getByTestId('sql-preview')).toHaveTextContent('SELECT 1');
    });

    it('Run Query calls onExecute with the current draft and exits editing on success', async () => {
        const onExecute = vi.fn().mockResolvedValue(undefined);

        render(<SqlEditor messageId="m1" sql="SELECT 1" onExecute={onExecute} />);

        fireEvent.click(screen.getByTestId('sql-edit-button'));
        const textarea = screen.getByTestId('sql-textarea') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'SELECT 2' } });
        fireEvent.click(screen.getByTestId('sql-run-button'));

        await waitFor(() => {
            expect(onExecute).toHaveBeenCalledTimes(1);
        });
        expect(onExecute).toHaveBeenCalledWith('SELECT 2');

        await waitFor(() => {
            expect(screen.queryByTestId('sql-textarea')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('sql-edit-button')).toBeInTheDocument();
    });

    it('Run Query shows the error and stays in editing mode on failure', async () => {
        const onExecute = vi.fn().mockRejectedValue(new Error('boom'));

        render(<SqlEditor messageId="m1" sql="SELECT 1" onExecute={onExecute} />);

        fireEvent.click(screen.getByTestId('sql-edit-button'));
        fireEvent.click(screen.getByTestId('sql-run-button'));

        const alert = await screen.findByTestId('sql-error');
        expect(alert).toHaveTextContent('boom');

        expect(screen.getByTestId('sql-textarea')).toBeInTheDocument();
        expect(screen.getByTestId('sql-run-button')).toBeInTheDocument();
    });

    it('Run Query on empty draft shows an inline error and does not call onExecute', async () => {
        const onExecute = vi.fn();
        render(<SqlEditor messageId="m1" sql="SELECT 1" onExecute={onExecute} />);

        fireEvent.click(screen.getByTestId('sql-edit-button'));
        const textarea = screen.getByTestId('sql-textarea') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: '   ' } });
        fireEvent.click(screen.getByTestId('sql-run-button'));

        await waitFor(() => {
            expect(screen.getByTestId('sql-error')).toHaveTextContent(/empty/i);
        });
        expect(onExecute).not.toHaveBeenCalled();
    });

    it('repeated edit cycles all see the Edit button reappear after each run', async () => {
        const onExecute = vi.fn().mockResolvedValue(undefined);
        const { rerender } = render(
            <SqlEditor messageId="m1" sql="SELECT 1" onExecute={onExecute} />,
        );

        for (const next of ['SELECT 2', 'SELECT 3', 'SELECT 4']) {
            fireEvent.click(screen.getByTestId('sql-edit-button'));
            const textarea = screen.getByTestId('sql-textarea') as HTMLTextAreaElement;
            fireEvent.change(textarea, { target: { value: next } });
            fireEvent.click(screen.getByTestId('sql-run-button'));

            await waitFor(() => {
                expect(onExecute).toHaveBeenCalledWith(next);
            });
            await waitFor(() => {
                expect(screen.queryByTestId('sql-textarea')).not.toBeInTheDocument();
            });
            expect(screen.getByTestId('sql-edit-button')).toBeInTheDocument();

            rerender(<SqlEditor messageId="m1" sql={next} onExecute={onExecute} />);
        }

        expect(onExecute).toHaveBeenCalledTimes(3);
    });

    it('syncing the sql prop while idle updates the preview and clears any stale error', () => {
        const { rerender } = render(
            <SqlEditor messageId="m1" sql="SELECT 1" onExecute={vi.fn()} />,
        );

        rerender(<SqlEditor messageId="m1" sql="SELECT updated" onExecute={vi.fn()} />);
        expect(screen.getByTestId('sql-preview')).toHaveTextContent('SELECT updated');
    });

    it('Copy writes the current SQL to clipboard', async () => {
        render(<SqlEditor messageId="m1" sql="SELECT copy_me" onExecute={vi.fn()} />);

        fireEvent.click(screen.getByTestId('sql-copy-button'));

        await waitFor(() => {
            expect(writeText).toHaveBeenCalledWith('SELECT copy_me');
        });
    });
});
