import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '@/components/ui/button';

export default function SettingsDropdown() {
    const { theme, toggleTheme } = useTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <Button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-full hover:bg-[#f4f4f4] dark:hover:bg-[#242730] text-[#5a5c5c] dark:text-[#b9bec9] transition-colors"
                title="Settings"
            >
                <span className="material-symbols-outlined text-[20px]">settings</span>
            </Button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-[#17181b] border border-[#eceeee] dark:border-[#2a2d33] rounded-2xl shadow-2xl z-50 overflow-hidden">
                    {/* Theme toggle row */}
                    <Button
                        type="button"
                        onClick={() => { toggleTheme(); setIsOpen(false); }}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#2d2f2f] dark:text-[#eceff4] hover:bg-[#f8f9f9] dark:hover:bg-[#1f2127] transition-colors"
                    >
                        <span className="flex items-center gap-2.5">
                            {theme === 'dark' ? (
                                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14.25 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                                </svg>
                            )}
                            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </span>
                    </Button>
                </div>
            )}
        </div>
    );
}
