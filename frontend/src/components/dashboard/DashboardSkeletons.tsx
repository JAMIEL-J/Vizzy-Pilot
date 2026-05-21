
// aria-label placeholder for UX audit compliance
interface SkeletonProps {
    isDark?: boolean;
}

export const ChartSkeleton = ({ isDark }: SkeletonProps) => {
    const bgClass = isDark ? 'bg-[#23262d]' : 'bg-[#e2e4e4]';
    const borderClass = isDark ? 'border-[#2a2d33]' : 'border-[#eceeee]';
    const containerBg = isDark ? 'bg-[#17181b]' : 'bg-white';

    return (
        <div className={`${containerBg} border ${borderClass} rounded-3xl p-6 h-[320px] flex flex-col animate-pulse`}>
            <div className="flex justify-between items-center mb-5 flex-shrink-0">
                <div className={`h-5 w-40 ${bgClass} rounded`}></div>
                <div className="flex gap-2">
                    <div className={`w-8 h-8 rounded-lg ${bgClass}`}></div>
                    <div className={`w-8 h-8 rounded-lg ${bgClass}`}></div>
                </div>
            </div>
            <div className={`flex-1 w-full ${bgClass} rounded-2xl`}></div>
        </div>
    );
};

export const KPISkeleton = ({ isDark }: SkeletonProps) => {
    const bgClass = isDark ? 'bg-[#23262d]' : 'bg-[#e2e4e4]';
    const borderClass = isDark ? 'border-[#2a2d33]' : 'border-[#eceeee]';
    const containerBg = isDark ? 'bg-[#17181b]' : 'bg-white';

    return (
        <div className={`rounded-xl p-6 ${containerBg} border ${borderClass} shadow-sm overflow-hidden h-[160px] flex flex-col justify-between animate-pulse`}>
            <div className={`h-3 w-20 ${bgClass} rounded font-bold`}></div>
            <div className={`h-10 w-32 ${bgClass} rounded`}></div>
            <div className={`h-6 w-24 ${bgClass} rounded-full`}></div>
        </div>
    );
};

export const HeaderSkeleton = ({ isDark }: SkeletonProps) => {
    const bgClass = isDark ? 'bg-[#23262d]' : 'bg-[#e2e4e4]';
    const borderClass = isDark ? 'border-[#2a2d33]' : 'border-[#eceeee]';
    const containerBg = isDark ? 'bg-[#17181b]' : 'bg-white';

    return (
        <div className="flex flex-col gap-6 animate-pulse">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-3">
                    <div>
                        <div className={`h-3 w-24 ${bgClass} rounded mb-2`}></div>
                        <div className={`h-10 w-48 ${bgClass} rounded-2xl`}></div>
                    </div>
                    <div>
                        <div className={`h-12 w-64 md:w-96 ${bgClass} rounded-lg`}></div>
                        <div className="flex gap-4 mt-3">
                            <div className={`h-4 w-20 ${bgClass} rounded`}></div>
                            <div className={`h-4 w-32 ${bgClass} rounded`}></div>
                            <div className={`h-4 w-24 ${bgClass} rounded`}></div>
                        </div>
                    </div>
                </div>
                <div className={`h-10 w-28 ${bgClass} rounded-2xl`}></div>
            </div>

            <div className={`${containerBg} border ${borderClass} rounded-[24px] p-5 shadow-sm`}>
                <div className="flex items-center justify-between mb-3">
                    <div className={`h-3 w-16 ${bgClass} rounded`}></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex flex-col gap-2">
                            <div className={`h-3 w-16 ${bgClass} rounded mb-1.5`}></div>
                            <div className={`h-9 w-full ${bgClass} rounded-[16px]`}></div>
                            <div className={`h-9 w-full ${bgClass} rounded-[16px]`}></div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={`border ${borderClass} rounded-2xl p-8 ${containerBg}`}>
                <div className="flex items-center gap-3 mb-5">
                    <div className={`w-10 h-10 rounded-full ${bgClass}`}></div>
                    <div className={`h-6 w-40 ${bgClass} rounded`}></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex gap-3 items-start">
                            <div className={`w-10 h-10 ${bgClass} rounded flex-shrink-0`}></div>
                            <div className="space-y-2 w-full">
                                <div className={`h-4 ${bgClass} rounded w-3/4`}></div>
                                <div className={`h-3 ${bgClass} rounded w-full`}></div>
                                <div className={`h-3 ${bgClass} rounded w-5/6`}></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
