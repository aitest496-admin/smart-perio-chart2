import React from 'react';

const mockImageUrl = `${import.meta.env.BASE_URL}images/perio-history-mock-v3.png`;

const HistoryMockPreview: React.FC<{ zoomLevel: number }> = ({ zoomLevel }) => (
    <div className="w-full p-4 md:p-8 print:p-0">
        <div className="mx-auto mb-4 max-w-[1100px] rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm print:hidden">
            <span className="font-bold">経過プレビュー · デザインモック</span>
            <p className="mt-1">過去10回の歯周ポケットとプラーク累計の表示イメージです。画像内はサンプルデータです。実際の検査結果の反映・歯のクリック連動は未実装です。</p>
        </div>
        <div className="mx-auto print:!w-full" style={{ width: `${1600 * zoomLevel}px` }}>
            <img
                src={mockImageUrl}
                alt="歯周ポケット・プラーク経過のデザインモック。左上に右上顎、右上に左上顎、左下に右下顎、右下に左下顎の各8歯の経過グラフ。中央に上顎・下顎のプラーク累計ヒートマップ。"
                className="block h-auto w-full rounded-lg border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none"
            />
        </div>
    </div>
);

export default HistoryMockPreview;
