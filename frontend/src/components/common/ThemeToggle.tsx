import { useTheme } from '../../context/ThemeContext';
import { Button } from '@/components/ui/button';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <Button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:ring-2 hover:ring-border-strong transition-all duration-300 flex items-center justify-center group"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            variant="ghost"
            size="icon"
        >
            {theme === 'light' ? (
                <svg className="w-5 h-5 group-hover:text-amber-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14.25 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"></path>
                </svg>
            ) : (
                <svg className="w-5 h-5 group-hover:text-foreground transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
                </svg>
            )}
        </Button>
    );
}
