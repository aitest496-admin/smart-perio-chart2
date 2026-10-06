import React, { useEffect, useRef, useState } from 'react';

const mockImageUrl = `${import.meta.env.BASE_URL}images/perio-history-mock-v3.png`;

// The iPad 7 landscape display is 2160 physical pixels / 2 = 1080 CSS pixels.
// Fit the available width at the app's default zoom; retain manual zoom controls.
const landscapeWidth = 2160 / 2;
const defaultZoom = 0.7;

const HistoryMockPreview: React.FC<{ zoomLevel: number }> = ({ zoomLevel }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
    const [imageRatio, setImageRatio] = useState(1672 / 941);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(([entry]) => {
            setAvailableSize({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const fittedWidth = Math.min(landscapeWidth, availableSize.width, availableSize.height * imageRatio);
    return (
    <div ref={containerRef} className="h-full w-full print:!h-auto print:p-0">
        <div className="mx-auto print:!w-full print:!max-w-none" style={{
            width: availableSize.width ? `${fittedWidth * (zoomLevel / defaultZoom)}px` : '100%'
        }}>
            <img
                src={mockImageUrl}
                onLoad={(event) => {
                    const image = event.currentTarget;
                    if (image.naturalHeight) setImageRatio(image.naturalWidth / image.naturalHeight);
                }}
                alt="歯周ポケット・プラーク経過のデザインモック。左上に右上顎、右上に左上顎、左下に右下顎、右下に左下顎の各8歯の経過グラフ。中央に上顎・下顎のプラーク累計ヒートマップ。"
                className="block h-auto w-full rounded-lg border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none"
            />
        </div>
    </div>
    );
};

export default HistoryMockPreview;
