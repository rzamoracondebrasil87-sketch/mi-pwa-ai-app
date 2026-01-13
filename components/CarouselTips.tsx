import React, { useState, useEffect } from 'react';

interface Tip {
    type: 'temperature' | 'expiration' | 'storage' | 'product';
    icon: string;
    title: string;
    content: string;
    color: 'blue' | 'red' | 'cyan' | 'purple';
}

interface CarouselTipsProps {
    tips: Tip[];
    autoRotate?: boolean;
    rotateInterval?: number;
}

export const CarouselTips: React.FC<CarouselTipsProps> = ({
    tips,
    autoRotate = true,
    rotateInterval = 5000,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [touchStartX, setTouchStartX] = useState<number>(0);

    // Auto-rotate carousel
    useEffect(() => {
        if (!autoRotate || tips.length <= 1) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % tips.length);
        }, rotateInterval);

        return () => clearInterval(timer);
    }, [tips.length, autoRotate, rotateInterval]);

    if (tips.length === 0) return null;

    const currentTip = tips[currentIndex];

    const colorClasses = {
        blue: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-100',
        red: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-100',
        cyan: 'bg-cyan-50 dark:bg-cyan-950 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-100',
        purple: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-100',
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStartX(e.touches[0].clientX);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        const touchEndX = e.changedTouches[0].clientX;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > 50) {
            // Swipe detected
            if (diff > 0) {
                // Swipe left → next
                setCurrentIndex((prev) => (prev + 1) % tips.length);
            } else {
                // Swipe right → prev
                setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length);
            }
        }
    };

    return (
        <div
            className={`card-rounded border-2 p-4 animate-slideUp cursor-grab active:cursor-grabbing ${colorClasses[currentTip.color]}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Content */}
            <div className="flex items-start gap-3 mb-3">
                <span className="text-3xl">{currentTip.icon}</span>
                <div>
                    <p className="font-bold text-lg">{currentTip.title}</p>
                    <p className="text-sm opacity-90">{currentTip.content}</p>
                </div>
            </div>

            {/* Navigation Dots */}
            {tips.length > 1 && (
                <div className="flex justify-center gap-2 mt-3">
                    {tips.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentIndex(index)}
                            className={`h-2 rounded-full transition-all ${
                                index === currentIndex
                                    ? 'bg-current w-6 opacity-100'
                                    : 'bg-current w-2 opacity-40 hover:opacity-60'
                            }`}
                            aria-label={`Tip ${index + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
