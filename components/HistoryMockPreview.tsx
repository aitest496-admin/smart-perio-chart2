import React from 'react';

const mockImageUrl = `${import.meta.env.BASE_URL}images/perio-history-mock-v3.png`;

// The iPad 7 landscape display is 2160 physical pixels / 2 = 1080 CSS pixels.
// Fit the available width at the app's default zoom; retain manual zoom controls.
const landscapeWidth = 2160 / 2;
const defaultZoom = 0.7;

const HistoryMockPreview: React.FC<{ zoomLevel: number }> = ({ zoomLevel }) => (
    <div className="w-full print:p-0">
        <div className="mx-auto print:!w-full print:!max-w-none" style={{
            width: `${(zoomLevel / defaultZoom) * 100}%`,
            maxWidth: `${landscapeWidth * (zoomLevel / defaultZoom)}px`
        }}>
            <img
                src={mockImageUrl}
                alt="歯周ポケット・プラーク経過のデザインモック。左上に右上顎、右上に左上顎、左下に右下顎、右下に左下顎の各8歯の経過グラフ。中央に上顎・下顎のプラーク累計ヒートマップ。"
                className="block h-auto w-full rounded-lg border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none"
            />
        </div>
    </div>
);

export default HistoryMockPreview;
