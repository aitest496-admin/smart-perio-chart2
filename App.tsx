import React, { useState, useEffect, useCallback, useRef } from 'react';
import Tooth from './components/Tooth';
import DentalChartPrintView from './components/SixPointPrintView';
import PisaPreview from './components/PisaPreview';
import HistoryMockPreview from './components/HistoryMockPreview';
import { ToothData, MeasurementMethod } from './types';
import { DentalDB, ExaminerRecord } from './services/db';
import CalendarModal from './components/CalendarModal';
import SettingsModal from './components/SettingsModal';
import ExaminerModal, { Examiner, NONE_EXAMINER_ID } from './components/ExaminerModal';

const examinerColors = [
    'bg-blue-600',
    'bg-emerald-600',
    'bg-amber-500',
    'bg-rose-500',
    'bg-indigo-600',
    'bg-cyan-600',
    'bg-violet-600',
    'bg-teal-600',
];

const noneExaminer: Examiner = {
    id: NONE_EXAMINER_ID,
    name: '担当無し',
    role: 'none',
    color: 'bg-slate-400',
    order: 0,
    hidden: false,
};

const defaultExaminers: Examiner[] = [
    noneExaminer,
    { id: '1', name: '山田 太郎', role: 'dentist', color: 'bg-blue-600', order: 1, hidden: false },
    { id: '2', name: '鈴木 和子', role: 'hygienist', color: 'bg-emerald-600', order: 2, hidden: false },
    { id: '3', name: '佐藤 健一', role: 'dentist', color: 'bg-amber-500', order: 3, hidden: false },
    { id: '4', name: '田中 美香', role: 'hygienist', color: 'bg-rose-500', order: 4, hidden: false },
    { id: '5', name: '伊藤 隆', role: 'dentist', color: 'bg-indigo-600', order: 5, hidden: false },
];

const normalizeExaminers = (source: Array<Partial<ExaminerRecord> | Examiner>): Examiner[] => {
    const byId = new Map<string, Examiner>();

    source.forEach((item, index) => {
        if (!item.id || item.id === NONE_EXAMINER_ID) return;
        byId.set(item.id, {
            id: item.id,
            name: item.name || '名称未設定',
            role: item.role === 'dentist' || item.role === 'hygienist' ? item.role : 'hygienist',
            color: item.color || examinerColors[index % examinerColors.length],
            order: typeof item.order === 'number' ? item.order : index + 1,
            hidden: Boolean(item.hidden),
        });
    });

    const normalized = Array.from(byId.values())
        .sort((a, b) => a.order - b.order)
        .map((examiner, index) => ({ ...examiner, order: index + 1 }));

    return [noneExaminer, ...normalized];
};

const toExaminerRecords = (items: Examiner[]): ExaminerRecord[] => (
    items.map((item, index) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        color: item.color,
        order: item.id === NONE_EXAMINER_ID ? 0 : index,
        hidden: item.id === NONE_EXAMINER_ID ? false : Boolean(item.hidden),
    }))
);

const getExaminerShortLabel = (examiner: Examiner) => {
    if (examiner.id === NONE_EXAMINER_ID) return 'なし';
    const parts = examiner.name.trim().split(/\s+/);
    return parts.length >= 2 ? parts[0][0] + parts[1][0] : examiner.name.substring(0, 2);
};

// Helper to create a single tooth
const createTooth = (id: number, isUpper: boolean): ToothData => {
    let furcationLength = 1;
    if (isUpper) {
        if (id >= 6) {
            furcationLength = 3;
        } else if (id === 4 || id === 5) {
            furcationLength = 2;
        }
    } else {
        if (id >= 6) {
            furcationLength = 2;
        }
    }
    return {
        id,
        mobility: 0,
        plaque: { distal: false, buccal: false, mesial: false, lingual: false, occlusal: false },
        pus: { buccal: [false, false, false], lingual: [false, false, false] },
        bleeding: { buccal: [false, false, false], lingual: [false, false, false] },
        pocketDepth: { buccal: [null, null, null], lingual: [null, null, null] },
        isMissing: false,
        isPrimary: false,
        furcation: Array(furcationLength).fill(null),
    };
};

// Helper to generate a range of teeth
const generateTeeth = (ids: number[], isUpper: boolean) => ids.map(id => createTooth(id, isUpper));

// Helper to generate full mouth data structure
const generateFullMouth = () => ({
    UL: generateTeeth([1, 2, 3, 4, 5, 6, 7, 8], true),       // Left Upper: 1 to 8 (Center to Left)
    UR: generateTeeth([8, 7, 6, 5, 4, 3, 2, 1], true),       // Right Upper: 8 to 1 (Right to Center)
    LL: generateTeeth([1, 2, 3, 4, 5, 6, 7, 8], false),      // Left Lower: 1 to 8 (Center to Left)
    LR: generateTeeth([8, 7, 6, 5, 4, 3, 2, 1], false),      // Right Lower: 8 to 1 (Right to Center)
});

type Quadrant = 'UL' | 'UR' | 'LL' | 'LR';
type FullMouthData = { UL: ToothData[]; UR: ToothData[]; LL: ToothData[]; LR: ToothData[] };
type BulkToggleTarget = 'plaque' | 'bleeding' | 'pus';

// --- UI Components ---

// Toast Notification
const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgClass = type === 'success' ? 'bg-blue-600' : type === 'error' ? 'bg-red-500' : 'bg-slate-700';

    return (
        <div className={`fixed bottom-4 right-4 ${bgClass} text-white px-4 py-2 rounded-lg shadow-lg z-[200] flex items-center gap-2 animate-fade-in-up`}>
            {type === 'success' && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
            )}
            <span className="font-bold text-sm">{message}</span>
        </div>
    );
};

// Tooltip Component (Stable definition outside App to prevent unmounting/remounting on state changes)
const WithTooltip: React.FC<{ label: string; children: React.ReactNode; className?: string; showLabels?: boolean }> = ({ label, children, className = "", showLabels = true }) => (
    <div className={`relative group flex items-center justify-center ${className}`}>
        {children}
        <div className={`
            absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-md shadow-xl 
            transition-all duration-200 pointer-events-none whitespace-nowrap z-[100] opacity-0 translate-y-1
            ${showLabels ? 'group-hover:opacity-100 group-hover:translate-y-0' : ''}
        `}>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45"></div>
            {label}
        </div>
    </div>
);

// MiniMap Component for visual navigation
const MiniMap: React.FC<{ current: Quadrant; onSelect: (q: Quadrant) => void; disabled?: boolean }> = ({ current, onSelect, disabled }) => {
    const Quad = ({ q, label, rounded }: { q: Quadrant; label: string; rounded: string }) => {
        const isActive = current === q && !disabled;
        const japaneseLabel: Record<Quadrant, string> = { UR: '右上', UL: '左上', LR: '右下', LL: '左下' };
        return (
            <button
                onPointerDown={() => !disabled && onSelect(q)}
                disabled={disabled}
                className={`w-10 h-8 flex items-center justify-center text-[10px] font-bold border transition-all duration-200 select-none
          ${isActive
                        ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-105 z-10 ring-1 ring-blue-300'
                        : 'bg-white text-slate-400 border-slate-300'}
          ${!disabled && !isActive ? 'hover:bg-slate-50 hover:text-slate-600' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${rounded}
        `}
                aria-label={`${label}を表示`}
                title={label}
            >
                {japaneseLabel[q]}
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-[1px] bg-slate-200 p-[2px] rounded border border-slate-300 shadow-inner">
            <div className="flex gap-[1px]">
                {/* Visual Layout: Patient Right is Viewer Left (UR), Patient Left is Viewer Right (UL) */}
                <Quad q="UR" label="右上" rounded="rounded-tl-sm" />
                <Quad q="UL" label="左上" rounded="rounded-tr-sm" />
            </div>
            <div className="flex gap-[1px]">
                <Quad q="LR" label="右下" rounded="rounded-bl-sm" />
                <Quad q="LL" label="左下" rounded="rounded-br-sm" />
            </div>
        </div>
    );
};

const MethodSelector: React.FC<{ current: MeasurementMethod; onChange: (m: MeasurementMethod) => void }> = ({ current, onChange }) => {
    return (
        <div className="relative inline-block text-left h-9">
            <select
                value={current}
                onChange={(e) => onChange(e.target.value as MeasurementMethod)}
                className="
            cursor-pointer appearance-none h-full
            bg-slate-50 border border-slate-200 hover:bg-white
            text-slate-700 text-xs font-bold 
            rounded-lg shadow-inner
            pl-3 pr-8 py-0
            focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
            transition-all
            flex items-center
        "
            >
                <option value="1-point">1点法</option>
                <option value="4-point">4点法</option>
                <option value="6-point">6点法</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
            </div>
        </div>
    );
};

// SideLabels Component to show Buccal/Lingual text and row titles
// Uses a single narrow column with pixel-exact heights matching each Tooth row
const SideLabels = ({ jaw, method }: { jaw: 'upper' | 'lower', method: MeasurementMethod }) => {
    if (method === '1-point') return null;

    const topSideText = jaw === 'upper' ? '頬側' : '舌側';
    const bottomSideText = jaw === 'upper' ? '口蓋側' : '頬側';

    // Exact heights matching Tooth.tsx rows (all border-box)
    const hPlaque = 70;     // PlaqueDiagram h-[70px]
    const hMobility = 28;   // Mobility row h-[28px]
    const hPus = 26;        // ThreePointToggle h-[26px]
    const hBleeding = 26;   // ThreePointToggle h-[26px]
    const hPD = 245;        // PocketDepthChart total: input(42.5) + 9cells(9×22.5)
    const hID = 52;         // Tooth ID h-[52px]
    const hFurcation = 40;  // Furcation involvement h-[40px]
    const hGap = 8;         // Gap spacing h-[8px]

    // Simple label row with exact height
    const Label = ({ text, h }: { text: string, h: number }) => (
        <div style={{ height: `${h}px` }}
            className="flex items-center justify-center text-[10px] text-slate-500 font-bold whitespace-nowrap">
            {text}
        </div>
    );

    // Empty spacer with exact height
    const Spacer = ({ h }: { h: number }) => (
        <div style={{ height: `${h}px` }} />
    );

    // Vertical text label spanning PD area
    const SideText = ({ text }: { text: string }) => (
        <div style={{ height: `${hPD}px` }}
            className="flex items-center justify-center">
            <span className="[writing-mode:vertical-rl] tracking-[0.25em] text-base font-black text-slate-600">
                {text}
            </span>
        </div>
    );

    return (
        // border-transparent matches Tooth's outer border for pixel alignment
        <div className="flex flex-col shrink-0 w-[30px] select-none border border-transparent">
            {/* === TOP BLOCK === */}
            {jaw === 'upper' ? (
                <>
                    {method === '6-point' && (
                        <>
                            <Label text="分岐部" h={hFurcation} />
                            <Spacer h={hGap} />
                        </>
                    )}
                    <Spacer h={hPlaque} />
                    <Label text="動揺" h={hMobility} />
                    <Label text="排膿" h={hPus} />
                    <Label text="出血" h={hBleeding} />
                    <SideText text={topSideText} />
                </>
            ) : (
                <>
                    <Label text="排膿" h={hPus} />
                    <Label text="出血" h={hBleeding} />
                    <SideText text={topSideText} />
                </>
            )}

            {/* === TOOTH ID SPACER (no label) === */}
            <Spacer h={hID} />

            {/* === BOTTOM BLOCK === */}
            {jaw === 'upper' ? (
                <>
                    <SideText text={bottomSideText} />
                    <Label text="出血" h={hBleeding} />
                    <Label text="排膿" h={hPus} />
                </>
            ) : (
                <>
                    <SideText text={bottomSideText} />
                    <Label text="出血" h={hBleeding} />
                    <Label text="排膿" h={hPus} />
                    <Label text="動揺" h={hMobility} />
                    <Spacer h={hPlaque} />
                    {method === '6-point' && (
                        <>
                            <Spacer h={hGap} />
                            <Label text="分岐部" h={hFurcation} />
                        </>
                    )}
                </>
            )}
        </div>
    );
};

const ensureFurcationInRecord = (data: any) => {
    if (!data) return data;
    const methods: MeasurementMethod[] = ['1-point', '4-point', '6-point'];
    const quadrants: Quadrant[] = ['UL', 'UR', 'LL', 'LR'];
    
    methods.forEach(method => {
        if (!data[method]) return;
        quadrants.forEach(quad => {
            if (!data[method][quad]) return;
            data[method][quad] = data[method][quad].map((tooth: any) => {
                const isUpper = quad.startsWith('U');
                let furcationLength = 1;
                if (isUpper) {
                    if (tooth.id >= 6) {
                        furcationLength = 3;
                    } else if (tooth.id === 4 || tooth.id === 5) {
                        furcationLength = 2;
                    }
                } else {
                    if (tooth.id >= 6) {
                        furcationLength = 2;
                    }
                }
                
                // If furcation is missing or has incorrect length, initialize it
                if (!tooth.furcation || tooth.furcation.length !== furcationLength) {
                    return {
                        ...tooth,
                        furcation: Array(furcationLength).fill(null)
                    };
                }
                return tooth;
            });
        });
    });
    return data;
};

const App: React.FC = () => {
    const [currentQuadrant, setCurrentQuadrant] = useState<Quadrant>('UL');
    const [measurementMethod, setMeasurementMethod] = useState<MeasurementMethod>('1-point');
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Execution Time States
    const [startTime, setStartTime] = useState<string>('');
    const [endTime, setEndTime] = useState<string>('');
    const [totalMinutes, setTotalMinutes] = useState<number>(0);

    // Examiner State
    const [examiners, setExaminers] = useState<Examiner[]>(defaultExaminers);
    const [selectedExaminer, setSelectedExaminer] = useState<Examiner>(noneExaminer);
    const [isExaminerModalOpen, setIsExaminerModalOpen] = useState(false);

    // Time Helpers
    const formatTime = (date: Date) => {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    };

    const addMinutesToTime = (timeStr: string, mins: number) => {
        if (!timeStr) return '';
        const [h, m] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(h, m + mins, 0, 0);
        return formatTime(date);
    };

    // Compute total minutes
    useEffect(() => {
        if (startTime && endTime) {
            const [sh, sm] = startTime.split(':').map(Number);
            const [eh, em] = endTime.split(':').map(Number);
            let diff = (eh * 60 + em) - (sh * 60 + sm);
            if (diff < 0) diff += 24 * 60; // handle overnight crossing
            setTotalMinutes(diff);
        } else {
            setTotalMinutes(0);
        }
    }, [startTime, endTime]);

    const handleStartTimeChange = (newStart: string) => {
        setStartTime(newStart);
        // Requirement 3.2: When start time changes, end time should follow (Start + 15m)
        setEndTime(addMinutesToTime(newStart, 15));
        setIsDirty(true);
    };

    const handleEndTimeChange = (newEnd: string) => {
        setEndTime(newEnd);
        setIsDirty(true);
    };

    const handleNowClick = () => {
        const now = new Date();
        const newStart = formatTime(now);
        setStartTime(newStart);
        setEndTime(addMinutesToTime(newStart, 15));
        setIsDirty(true);
    };

    const handleAdd5Min = () => {
        setEndTime(addMinutesToTime(endTime, 5));
        setIsDirty(true);
    };

    // Preview Mode State
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isPisaPreview, setIsPisaPreview] = useState(false); // PISA Preview toggle
    const [isHistoryPreview, setIsHistoryPreview] = useState(false);
    const [pendingPreviewView, setPendingPreviewView] = useState<'chart' | 'history' | 'compare'>('chart');
    const [showFurcation, setShowFurcation] = useState(false); // Global Furcation involvement visibility state
    const [previewPlaqueMode, setPreviewPlaqueMode] = useState<'all' | 'plaque-only' | 'plaque-none'>('all');
    const [isCompareMode, setIsCompareMode] = useState(false); // Comparison Mode State
    const [isCompareListOpen, setIsCompareListOpen] = useState(false); // Date Selection Modal for Compare

    // Multiple Comparison States
    const [compareTargetDates, setCompareTargetDates] = useState<string[]>([]);
    const [comparisonData, setComparisonData] = useState<Record<string, any>>({}); // Keep any for now or use Record<string, ChartRecord>

    const [zoomLevel, setZoomLevel] = useState(0.7); // Default zoom level for preview

    // Height Measurement for Preview Scrolling
    const previewContentRef = useRef<HTMLDivElement>(null);
    const [previewContentHeight, setPreviewContentHeight] = useState<number>(0);
    const [isCopyingPreview, setIsCopyingPreview] = useState(false);

    // Pinch Zoom Refs
    const touchStartDist = useRef<number>(0);
    const startZoomLevel = useRef<number>(0);

    // Modal States
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [markedDates, setMarkedDates] = useState<string[]>([]);
    const [isSaveConfirmModalOpen, setIsSaveConfirmModalOpen] = useState(false); // New modal for save confirmation

    // Dirty State (Unsaved Changes)
    const [isDirty, setIsDirty] = useState(false);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
    const [pendingDate, setPendingDate] = useState<string | null>(null);

    // Toast State
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    // --- Icon Text Auto-hide Logic ---
    const [showLabels, setShowLabels] = useState(true);
    const labelTimerRef = useRef<NodeJS.Timeout | null>(null);

    const resetLabelTimer = useCallback(() => {
        setShowLabels(true);
        if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
        labelTimerRef.current = setTimeout(() => {
            setShowLabels(false);
        }, 2000);
    }, []);

    useEffect(() => {
        resetLabelTimer();
        const handleInteraction = () => resetLabelTimer();
        window.addEventListener('pointerdown', handleInteraction);
        return () => {
            if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
            window.removeEventListener('pointerdown', handleInteraction);
        };
    }, [resetLabelTimer]);





    // Main Data Store
    const [allTeethData, setAllTeethData] = useState<Record<MeasurementMethod, FullMouthData>>({
        '1-point': generateFullMouth(),
        '4-point': generateFullMouth(),
        '6-point': generateFullMouth(),
    });

    const currentTeethData = allTeethData[measurementMethod];

    // --- Database Interactions ---

    const updateMarkedDates = useCallback(async () => {
        try {
            const dates = await DentalDB.getAllDates();
            setMarkedDates(dates);
        } catch (e) {
            console.error("Failed to update marked dates", e);
        }
    }, []);

    const persistExaminers = useCallback(async (nextExaminers: Examiner[]) => {
        const normalized = normalizeExaminers(nextExaminers);
        setExaminers(normalized);
        await DentalDB.saveAllExaminers(toExaminerRecords(normalized));
        return normalized;
    }, []);

    const loadExaminers = useCallback(async () => {
        try {
            const stored = await DentalDB.getAllExaminers();
            const normalized = stored.length > 0 ? normalizeExaminers(stored) : defaultExaminers;
            const shouldSaveDefaults = stored.length === 0 || !stored.some((examiner) => examiner.id === NONE_EXAMINER_ID);

            setExaminers(normalized);
            if (shouldSaveDefaults) {
                await DentalDB.saveAllExaminers(toExaminerRecords(normalized));
            }
        } catch (error) {
            console.error("Failed to load examiners", error);
            setExaminers(defaultExaminers);
            setToast({ message: "担当者情報の読み込みに失敗しました", type: 'error' });
        }
    }, []);

    const loadDataForDate = useCallback(async (date: string) => {
        try {
            const record = await DentalDB.getChart(date);
            if (record) {
                const upgradedData = ensureFurcationInRecord(record.data);
                setAllTeethData(upgradedData);
                if (record.startTime && record.endTime) {
                    setStartTime(record.startTime);
                    setEndTime(record.endTime);
                } else {
                    // Fallback if older record lacks time
                    const now = new Date();
                    setStartTime(formatTime(now));
                    setEndTime(formatTime(new Date(now.getTime() + 15 * 60000)));
                }

                // Restore examiner
                if (record.examinerId) {
                    const found = examiners.find(e => e.id === record.examinerId);
                    if (found) {
                        setSelectedExaminer(found);
                    } else if (record.examinerName) {
                        // Fallback for custom/deleted examiners
                        setSelectedExaminer({
                            id: record.examinerId,
                            name: record.examinerName,
                            role: record.examinerRole === 'dentist' || record.examinerRole === 'hygienist' ? record.examinerRole : 'hygienist',
                            color: record.examinerColor || 'bg-slate-500',
                            order: examiners.length + 1,
                            hidden: false,
                        });
                    }
                } else if (record.examinerName) {
                    const foundByName = examiners.find(e => e.name === record.examinerName);
                    if (foundByName) {
                        setSelectedExaminer(foundByName);
                    } else {
                        setSelectedExaminer({
                            id: `legacy-${record.examinerName}`,
                            name: record.examinerName,
                            role: record.examinerRole === 'dentist' || record.examinerRole === 'hygienist' ? record.examinerRole : 'hygienist',
                            color: record.examinerColor || 'bg-slate-500',
                            order: examiners.length + 1,
                            hidden: false,
                        });
                    }
                } else {
                    setSelectedExaminer(noneExaminer);
                }

                setToast({ message: `${date.replace(/-/g, '/')} のデータを読み込みました`, type: 'info' });
            } else {
                // If no data exists for this date, reset to empty
                setAllTeethData({
                    '1-point': generateFullMouth(),
                    '4-point': generateFullMouth(),
                    '6-point': generateFullMouth(),
                });
                // Initialize default execution time
                const now = new Date();
                setStartTime(formatTime(now));
                setEndTime(formatTime(new Date(now.getTime() + 15 * 60000)));
                setSelectedExaminer(noneExaminer);
            }
            setIsDirty(false); // Reset dirty state on load
        } catch (error) {
            console.error("Failed to load data", error);
            setToast({ message: "データの読み込みに失敗しました", type: 'error' });
        }
    }, [examiners]);

    // Load data for multiple comparison dates
    const loadComparisonData = async (dates: string[]) => {
        const newData: Record<string, any> = {};
        let loadedCount = 0;
        for (const date of dates) {
            try {
                const record = await DentalDB.getChart(date);
                if (record) {
                    record.data = ensureFurcationInRecord(record.data);
                    newData[date] = record;
                    loadedCount++;
                }
            } catch (e) {
                console.error(`Failed to load comparison data for ${date}`, e);
            }
        }
        setComparisonData(newData);
        if (loadedCount > 0) {
            setToast({ message: `${loadedCount}件の比較データを読み込みました`, type: 'info' });
        }
    };

    const handleSave = async () => {
        try {
            await DentalDB.saveChart({
                date: selectedDate,
                data: allTeethData,
                updatedAt: Date.now(),
                startTime,
                endTime,
                examinerId: selectedExaminer.id,
                examinerName: selectedExaminer.name,
                examinerColor: selectedExaminer.color,
                examinerRole: selectedExaminer.role
            });
            setToast({ message: "保存しました", type: 'success' });
            await updateMarkedDates(); // Update calendar markers
            setIsDirty(false); // Reset dirty state on save
            return true; // Return success
        } catch (error) {
            console.error("Failed to save", error);
            setToast({ message: "保存に失敗しました", type: 'error' });
            return false;
        }
    };

    const activatePreviewView = (view: 'chart' | 'history' | 'compare') => {
        setIsPreviewMode(true);
        setIsHistoryPreview(view === 'history');
        setIsPisaPreview(false);
        if (view === 'compare') {
            handleCompareClick();
        } else {
            setIsCompareMode(false);
            setCompareTargetDates([]);
            setComparisonData({});
        }
        if (view === 'history') setZoomLevel(0.7);
    };

    const requestPreviewView = (view: 'chart' | 'history' | 'compare') => {
        if (!isPreviewMode && isDirty) {
            setPendingPreviewView(view);
            setIsSaveConfirmModalOpen(true);
        } else {
            activatePreviewView(view);
        }
    };

    const handleSaveAndPreview = async () => {
        const success = await handleSave();
        if (success) {
            setIsSaveConfirmModalOpen(false);
            activatePreviewView(pendingPreviewView);
            setPendingPreviewView('chart');
        }
    };

    const handleSelectDate = (date: string) => {
        if (date === selectedDate) return;
        
        if (isDirty) {
            setPendingDate(date);
            setIsUnsavedModalOpen(true);
        } else {
            setSelectedDate(date);
        }
    };

    // Initial load and when date changes
    useEffect(() => {
        loadExaminers();
    }, [loadExaminers]);

    // Initial load and when date changes
    useEffect(() => {
        updateMarkedDates();
        loadDataForDate(selectedDate);
    }, [selectedDate, loadDataForDate, updateMarkedDates]);

    // Observer for Preview Content Height
    useEffect(() => {
        if (!isPreviewMode) return;

        const element = previewContentRef.current;
        if (!element) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setPreviewContentHeight(entry.contentRect.height);
            }
        });

        resizeObserver.observe(element);

        return () => {
            resizeObserver.disconnect();
        };
    }, [isPreviewMode, isCompareMode, compareTargetDates]); // Re-attach if modes change heavily, though observe persists usually

    // --- Handlers ---

    const getPreviewConfig = (method: MeasurementMethod) => {
        switch (method) {
            case '1-point':
                return { indices: [1], showLingual: false, pointsPerTooth: 1, colsTotal: 16 };
            case '4-point':
                return { indices: [0, 2], showLingual: true, pointsPerTooth: 2, colsTotal: 32 };
            case '6-point':
            default:
                return { indices: [0, 1, 2], showLingual: true, pointsPerTooth: 3, colsTotal: 48 };
        }
    };

    const getPreviewStats = (
        data: { UL: ToothData[]; UR: ToothData[]; LL: ToothData[]; LR: ToothData[] },
        method: MeasurementMethod
    ) => {
        const config = getPreviewConfig(method);
        let plaqueSurfaces = 0;
        let totalPlaqueSurfaces = 0;
        let bleedingPoints = 0;
        let totalBleedingPoints = 0;

        [...data.UR, ...data.UL, ...data.LR, ...data.LL].forEach((tooth) => {
            if (tooth.isMissing) return;

            if (tooth.plaque.mesial) plaqueSurfaces++;
            if (tooth.plaque.distal) plaqueSurfaces++;
            if (tooth.plaque.buccal) plaqueSurfaces++;
            if (tooth.plaque.lingual) plaqueSurfaces++;
            totalPlaqueSurfaces += 4;

            config.indices.forEach((idx) => {
                if (tooth.bleeding.buccal[idx]) bleedingPoints++;
                totalBleedingPoints++;
            });

            if (config.showLingual) {
                config.indices.forEach((idx) => {
                    if (tooth.bleeding.lingual[idx]) bleedingPoints++;
                    totalBleedingPoints++;
                });
            }
        });

        return {
            pcr: totalPlaqueSurfaces > 0 ? ((plaqueSurfaces / totalPlaqueSurfaces) * 100).toFixed(1) : '0.0',
            bop: totalBleedingPoints > 0 ? ((bleedingPoints / totalBleedingPoints) * 100).toFixed(1) : '0.0',
        };
    };

    const getCanvasDepthColor = (depth: number | null) => {
        if (depth === null) return '#ffffff';
        if (depth >= 10) return '#ff4d4d';
        if (depth >= 7) return '#ffc0cb';
        if (depth >= 4) return '#ffff00';
        return '#ffffff';
    };

    const getCanvasFurcationColor = (value: string | null) => {
        if (value === 'Ⅰ') return '#fef9c3';
        if (value === 'Ⅱ') return '#ffedd5';
        if (value === 'Ⅲ') return '#fee2e2';
        return '#ffffff';
    };

    const createPreviewImageBlob = async (): Promise<Blob> => {
        const entries = [
            { date: selectedDate, data: allTeethData[measurementMethod], examiner: selectedExaminer, comparisonLabel: '' },
            ...(isCompareMode ? compareTargetDates.flatMap((date) => {
                const record = comparisonData[date];
                if (!record) return [];
                return [{
                    date,
                    data: record.data[measurementMethod],
                    examiner: record.examinerId ? {
                        id: record.examinerId,
                        name: record.examinerName || '',
                        color: record.examinerColor || 'bg-slate-500',
                    } : undefined,
                    comparisonLabel: `過去データ: ${date.replace(/-/g, '/')}`,
                }];
            }) : []),
        ];

        const config = getPreviewConfig(measurementMethod);
        const logicalWidth = 1100;
        const margin = 32;
        const labelWidth = 56;
        const headerHeight = 54;
        const toothRowHeight = 28;
        const footerHeight = 34;
        const rowHeight = 28;
        const smallRowHeight = 16;
        const gap = 44;
        const isPlaqueOnly = previewPlaqueMode === 'plaque-only';
        const isPlaqueHidden = previewPlaqueMode === 'plaque-none';
        const showFurcationRows = measurementMethod === '6-point' && showFurcation && !isPlaqueOnly;
        const upperRows = isPlaqueOnly
            ? [rowHeight]
            : (showFurcationRows ? [rowHeight] : [])
                .concat(isPlaqueHidden ? [] : [rowHeight])
                .concat([rowHeight, smallRowHeight, rowHeight])
                .concat(config.showLingual ? [rowHeight, smallRowHeight] : []);
        const lowerRows = isPlaqueOnly
            ? [rowHeight]
            : (config.showLingual ? [smallRowHeight, rowHeight] : [])
                .concat([rowHeight, smallRowHeight, rowHeight])
                .concat(isPlaqueHidden ? [] : [rowHeight])
                .concat(showFurcationRows ? [rowHeight] : []);
        const chartFooterHeight = isPlaqueOnly ? 0 : footerHeight;
        const chartHeight = headerHeight + upperRows.reduce((sum, value) => sum + value, 0) + toothRowHeight + lowerRows.reduce((sum, value) => sum + value, 0) + chartFooterHeight;
        const logicalHeight = margin * 2 + entries.length * chartHeight + Math.max(0, entries.length - 1) * gap;
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = logicalWidth * scale;
        canvas.height = logicalHeight * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context is unavailable');

        ctx.scale(scale, scale);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, logicalWidth, logicalHeight);
        ctx.textBaseline = 'middle';

        const drawText = (text: string, x: number, y: number, size = 11, weight = '600', color = '#0f172a', align: CanvasTextAlign = 'center') => {
            ctx.fillStyle = color;
            ctx.font = `${weight} ${size}px sans-serif`;
            ctx.textAlign = align;
            ctx.fillText(text, x, y);
        };

        const drawCell = (x: number, y: number, w: number, h: number, fill = '#ffffff', stroke = '#1e293b') => {
            ctx.fillStyle = fill;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
        };

        const drawPlaque = (tooth: ToothData, x: number, y: number, w: number, h: number) => {
            drawCell(x, y, w, h, tooth.isMissing ? '#cbd5e1' : '#ffffff');
            if (tooth.isMissing) return;
            const cx = x + w / 2;
            const cy = y + h / 2;
            const active = '#ef4444';
            const paths: Array<[boolean, Array<[number, number]>]> = [
                [tooth.plaque.buccal, [[x, y], [x + w, y], [cx, cy]]],
                [tooth.plaque.lingual, [[x, y + h], [x + w, y + h], [cx, cy]]],
                [tooth.plaque.mesial, [[x, y], [x, y + h], [cx, cy]]],
                [tooth.plaque.distal, [[x + w, y], [x + w, y + h], [cx, cy]]],
            ];
            paths.forEach(([isActive, points]) => {
                if (!isActive) return;
                ctx.beginPath();
                ctx.moveTo(points[0][0], points[0][1]);
                points.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
                ctx.closePath();
                ctx.fillStyle = active;
                ctx.fill();
            });
            ctx.strokeStyle = '#1e293b';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y + h);
            ctx.moveTo(x + w, y);
            ctx.lineTo(x, y + h);
            ctx.stroke();
        };

        const drawMeasureCells = (tooth: ToothData, side: 'buccal' | 'lingual', x: number, y: number, w: number, h: number) => {
            const cellWidth = w / config.indices.length;
            config.indices.forEach((idx, i) => {
                const depth = tooth.pocketDepth[side][idx];
                const cellX = x + i * cellWidth;
                drawCell(cellX, y, cellWidth, h, tooth.isMissing ? '#cbd5e1' : getCanvasDepthColor(depth));
                if (!tooth.isMissing && depth !== null) {
                    drawText(String(depth), cellX + cellWidth / 2, y + h / 2, 12, '700', depth >= 10 ? '#ffffff' : '#0f172a');
                }
            });
        };

        const drawBleedingPusCells = (tooth: ToothData, side: 'buccal' | 'lingual', x: number, y: number, w: number, h: number) => {
            const cellWidth = w / config.indices.length;
            config.indices.forEach((idx, i) => {
                const cellX = x + i * cellWidth;
                drawCell(cellX, y, cellWidth, h, tooth.isMissing ? '#cbd5e1' : '#ffffff');
                if (tooth.isMissing) return;
                const bleeding = tooth.bleeding[side][idx];
                const pus = tooth.pus[side][idx];
                if (bleeding && pus) {
                    drawCell(cellX, y, cellWidth / 2, h, '#ff4d4d');
                    drawCell(cellX + cellWidth / 2, y, cellWidth / 2, h, '#808080');
                } else if (bleeding) {
                    drawCell(cellX, y, cellWidth, h, '#ff4d4d');
                } else if (pus) {
                    drawCell(cellX, y, cellWidth, h, '#808080');
                }
            });
        };

        const drawFurcation = (tooth: ToothData, isUpper: boolean, x: number, y: number, w: number, h: number) => {
            drawCell(x, y, w, h, tooth.isMissing ? '#cbd5e1' : '#ffffff');
            if (tooth.isMissing) return;
            const count = isUpper ? (tooth.id >= 6 ? 3 : tooth.id >= 4 ? 2 : 1) : (tooth.id >= 6 ? 2 : 1);
            const values = tooth.furcation && tooth.furcation.length === count ? tooth.furcation : Array(count).fill(null);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;

            const drawPolygon = (points: Array<[number, number]>, fill: string) => {
                ctx.beginPath();
                ctx.moveTo(points[0][0], points[0][1]);
                points.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.stroke();
            };

            if (isUpper && tooth.id >= 6) {
                const centerX = x + w / 2;
                const centerY = y + h / 2;
                drawPolygon([[x, y], [centerX, centerY], [centerX, y + h], [x, y + h]], getCanvasFurcationColor(values[0]));
                drawPolygon([[x + w, y], [centerX, centerY], [centerX, y + h], [x + w, y + h]], getCanvasFurcationColor(values[1]));
                drawPolygon([[x, y], [centerX, centerY], [x + w, y]], getCanvasFurcationColor(values[2]));
                if (values[0]) drawText(values[0], x + w * 0.25, y + h * 0.62, 12, '800');
                if (values[1]) drawText(values[1], x + w * 0.75, y + h * 0.62, 12, '800');
                if (values[2]) drawText(values[2], x + w * 0.5, y + h * 0.2, 12, '800');
                return;
            }

            if (isUpper && (tooth.id === 4 || tooth.id === 5)) {
                drawCell(x, y, w / 2, h, getCanvasFurcationColor(values[0]), '#94a3b8');
                drawCell(x + w / 2, y, w / 2, h, getCanvasFurcationColor(values[1]), '#94a3b8');
                if (values[0]) drawText(values[0], x + w * 0.25, y + h / 2, 12, '800');
                if (values[1]) drawText(values[1], x + w * 0.75, y + h / 2, 12, '800');
                return;
            }

            if (!isUpper && tooth.id >= 6) {
                drawCell(x, y, w, h / 2, getCanvasFurcationColor(values[0]), '#94a3b8');
                drawCell(x, y + h / 2, w, h / 2, getCanvasFurcationColor(values[1]), '#94a3b8');
                if (values[0]) drawText(values[0], x + w / 2, y + h * 0.25, 12, '800');
                if (values[1]) drawText(values[1], x + w / 2, y + h * 0.75, 12, '800');
                return;
            }

            drawCell(x, y, w, h, getCanvasFurcationColor(values[0]), '#94a3b8');
            if (values[0]) drawText(values[0], x + w / 2, y + h / 2, 12, '800');
        };

        const drawToothRow = (teeth: ToothData[], y: number) => {
            drawCell(margin, y, labelWidth, toothRowHeight, '#f1f5f9');
            drawText('部位', margin + labelWidth / 2, y + toothRowHeight / 2, 11, '800');
            const toothWidth = (logicalWidth - margin * 2 - labelWidth) / 16;
            teeth.forEach((tooth, i) => {
                const x = margin + labelWidth + i * toothWidth;
                drawCell(x, y, toothWidth, toothRowHeight, tooth.isMissing ? '#0f172a' : tooth.isPrimary ? '#16a34a' : '#f8fafc');
                drawText(String(tooth.isPrimary ? ['A', 'B', 'C', 'D', 'E'][tooth.id - 1] ?? tooth.id : tooth.id), x + toothWidth / 2, y + toothRowHeight / 2, 14, '800', tooth.isMissing || tooth.isPrimary ? '#ffffff' : '#0f172a');
            });
        };

        const drawRows = (teeth: ToothData[], isUpper: boolean, y: number, rowDefs: Array<{ label: string; height: number; render: (tooth: ToothData, x: number, y: number, w: number, h: number) => void }>) => {
            const pointWidth = (logicalWidth - margin * 2 - labelWidth) / config.colsTotal;
            rowDefs.forEach((row) => {
                drawCell(margin, y, labelWidth, row.height, '#ffffff');
                drawText(row.label, margin + labelWidth / 2, y + row.height / 2, row.label.length > 4 ? 9 : 10, '800');
                teeth.forEach((tooth, i) => {
                    const x = margin + labelWidth + i * pointWidth * config.pointsPerTooth;
                    row.render(tooth, x, y, pointWidth * config.pointsPerTooth, row.height);
                    if (i === 7) {
                        ctx.strokeStyle = '#0f172a';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(x + pointWidth * config.pointsPerTooth, y);
                        ctx.lineTo(x + pointWidth * config.pointsPerTooth, y + row.height);
                        ctx.stroke();
                        ctx.lineWidth = 1;
                    }
                });
                y += row.height;
            });
            return y;
        };

        let y = margin;
        entries.forEach((entry) => {
            const stats = getPreviewStats(entry.data, measurementMethod);
            const upperTeeth = [...entry.data.UR, ...entry.data.UL];
            const lowerTeeth = [...entry.data.LR, ...entry.data.LL];

            if (entry.comparisonLabel) {
                drawText(entry.comparisonLabel, margin, y - 14, 13, '800', '#4f46e5', 'left');
            }

            const chartTitle = measurementMethod === '1-point'
                ? '歯周基本検査表'
                : `歯周精密検査表 (${measurementMethod === '4-point' ? '4点法' : '6点法'})`;
            drawText(chartTitle, margin, y + 18, 20, '800', '#0f172a', 'left');
            const headerMeta = `実施者: ${entry.examiner?.name || '担当無し'}   検査日 ${entry.date.replace(/-/g, '.')}${isPlaqueHidden ? '' : `   PCR ${stats.pcr}%`}`;
            drawText(headerMeta, logicalWidth - margin, y + 18, 13, '800', '#0f172a', 'right');
            y += headerHeight;

            const upperDefs = [
                ...(showFurcationRows ? [{ label: '根分岐部', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawFurcation(tooth, true, x, yy, w, h) }] : []),
                ...(isPlaqueHidden ? [] : [{ label: 'プラーク', height: rowHeight, render: drawPlaque }]),
                ...(isPlaqueOnly ? [] : [
                    { label: '動揺度', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => { drawCell(x, yy, w, h, tooth.isMissing ? '#cbd5e1' : '#ffffff'); if (!tooth.isMissing && tooth.mobility > 0) drawText(String(tooth.mobility), x + w / 2, yy + h / 2, 12, '800'); } },
                    { label: '出血・排膿', height: smallRowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawBleedingPusCells(tooth, 'buccal', x, yy, w, h) },
                    { label: 'ポケット', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawMeasureCells(tooth, 'buccal', x, yy, w, h) },
                    ...(config.showLingual ? [
                        { label: 'ポケット', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawMeasureCells(tooth, 'lingual', x, yy, w, h) },
                        { label: '出血・排膿', height: smallRowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawBleedingPusCells(tooth, 'lingual', x, yy, w, h) },
                    ] : []),
                ]),
            ];
            y = drawRows(upperTeeth, true, y, upperDefs);
            drawToothRow(upperTeeth, y);
            y += toothRowHeight;

            const lowerDefs = [
                ...(isPlaqueOnly ? [] : config.showLingual ? [
                    { label: '出血・排膿', height: smallRowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawBleedingPusCells(tooth, 'lingual', x, yy, w, h) },
                    { label: 'ポケット', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawMeasureCells(tooth, 'lingual', x, yy, w, h) },
                ] : []),
                ...(isPlaqueOnly ? [] : [
                    { label: 'ポケット', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawMeasureCells(tooth, 'buccal', x, yy, w, h) },
                    { label: '出血・排膿', height: smallRowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawBleedingPusCells(tooth, 'buccal', x, yy, w, h) },
                    { label: '動揺度', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => { drawCell(x, yy, w, h, tooth.isMissing ? '#cbd5e1' : '#ffffff'); if (!tooth.isMissing && tooth.mobility > 0) drawText(String(tooth.mobility), x + w / 2, yy + h / 2, 12, '800'); } },
                ]),
                ...(isPlaqueHidden ? [] : [{ label: 'プラーク', height: rowHeight, render: drawPlaque }]),
                ...(showFurcationRows ? [{ label: '根分岐部', height: rowHeight, render: (tooth: ToothData, x: number, yy: number, w: number, h: number) => drawFurcation(tooth, false, x, yy, w, h) }] : []),
            ];
            y = drawRows(lowerTeeth, false, y, lowerDefs);

            if (!isPlaqueOnly) {
                drawText(`出血: 赤   排膿: 灰   BOP ${stats.bop}%   プロービング: 4-6mm(黄) 7mm以上(桃/赤)`, margin, y + 18, 11, '700', '#334155', 'left');
            }
            y += chartFooterHeight + gap;
        });

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('PNG conversion failed');
        return blob;
    };

    const downloadPreviewImage = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `perio-chart-${selectedDate}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleCopyPreviewImage = async () => {
        if (!previewContentRef.current || isCopyingPreview) return;

        setIsCopyingPreview(true);

        try {
            const blobPromise = createPreviewImageBlob();

            if ('ClipboardItem' in window && navigator.clipboard?.write) {
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blobPromise })
                    ]);
                    setToast({ message: "プレビュー画像をコピーしました", type: 'success' });
                    return;
                } catch (clipboardError) {
                    console.error("Clipboard write failed", clipboardError);
                }
            }

            const blob = await blobPromise;
            downloadPreviewImage(blob);
            setToast({ message: "画像コピーに対応していないためPNGを保存しました", type: 'info' });
        } catch (error) {
            console.error("Failed to copy preview image", error);
            setToast({ message: "画像の作成に失敗しました", type: 'error' });
        } finally {
            setIsCopyingPreview(false);
        }
    };

    const handleToothUpdate = (quadrant: Quadrant, updatedTooth: ToothData) => {
        setAllTeethData(prev => ({
            ...prev,
            [measurementMethod]: {
                ...prev[measurementMethod],
                [quadrant]: prev[measurementMethod][quadrant].map(t => t.id === updatedTooth.id ? updatedTooth : t)
            }
        }));
        setIsDirty(true); // Mark as dirty on change
    };

    const getBulkMeasurementConfig = (method: MeasurementMethod) => {
        switch (method) {
            case '1-point':
                return { indices: [1] as const, sides: ['buccal'] as const };
            case '4-point':
                return { indices: [0, 2] as const, sides: ['buccal', 'lingual'] as const };
            case '6-point':
            default:
                return { indices: [0, 1, 2] as const, sides: ['buccal', 'lingual'] as const };
        }
    };

    const handleBulkPocketDepth = (value: 1 | 2 | 3 | 4 | 5) => {
        const { indices, sides } = getBulkMeasurementConfig(measurementMethod);

        setAllTeethData(prev => {
            const currentData = prev[measurementMethod];
            const quadrants: Quadrant[] = ['UL', 'UR', 'LL', 'LR'];
            const newMethodData = { ...currentData };

            quadrants.forEach(quad => {
                newMethodData[quad] = currentData[quad].map(tooth => {
                    const nextPocketDepth = {
                        buccal: [...tooth.pocketDepth.buccal] as [number | null, number | null, number | null],
                        lingual: [...tooth.pocketDepth.lingual] as [number | null, number | null, number | null],
                    };

                    sides.forEach(side => {
                        indices.forEach(index => {
                            nextPocketDepth[side][index] = value;
                        });
                    });

                    return { ...tooth, pocketDepth: nextPocketDepth };
                });
            });

            return { ...prev, [measurementMethod]: newMethodData };
        });

        setIsDirty(true);
        setToast({ message: `ポケット${value}mmを一括入力しました`, type: 'success' });
    };

    const handleBulkToggleMeasurement = (target: BulkToggleTarget) => {
        const { indices, sides } = getBulkMeasurementConfig(measurementMethod);

        setAllTeethData(prev => {
            const currentData = prev[measurementMethod];
            const quadrants: Quadrant[] = ['UL', 'UR', 'LL', 'LR'];
            const teeth = quadrants.flatMap(quad => currentData[quad]).filter(tooth => !tooth.isMissing);

            const shouldTurnOn = target === 'plaque'
                ? !teeth.every(tooth => Object.values(tooth.plaque).every(Boolean))
                : !teeth.every(tooth => sides.every(side => indices.every(index => tooth[target][side][index])));

            const newMethodData = { ...currentData };

            quadrants.forEach(quad => {
                newMethodData[quad] = currentData[quad].map(tooth => {
                    if (tooth.isMissing) return tooth;

                    if (target === 'plaque') {
                        return {
                            ...tooth,
                            plaque: {
                                distal: shouldTurnOn,
                                buccal: shouldTurnOn,
                                mesial: shouldTurnOn,
                                lingual: shouldTurnOn,
                                occlusal: shouldTurnOn,
                            },
                        };
                    }

                    const nextMeasurement = {
                        buccal: [...tooth[target].buccal] as [boolean, boolean, boolean],
                        lingual: [...tooth[target].lingual] as [boolean, boolean, boolean],
                    };

                    sides.forEach(side => {
                        indices.forEach(index => {
                            nextMeasurement[side][index] = shouldTurnOn;
                        });
                    });

                    return { ...tooth, [target]: nextMeasurement };
                });
            });

            return { ...prev, [measurementMethod]: newMethodData };
        });

        const labels: Record<BulkToggleTarget, string> = {
            plaque: 'プラーク',
            bleeding: '出血',
            pus: '排膿',
        };
        setIsDirty(true);
        setToast({ message: `${labels[target]}を一括切替しました`, type: 'success' });
    };

    // Bulk Status Update Handler
    const handleBulkStatusChange = (mode: 'all_missing' | 'all_primary' | 'reset') => {
        setAllTeethData(prev => {
            const currentData = prev[measurementMethod];
            const quadrants: Quadrant[] = ['UL', 'UR', 'LL', 'LR'];

            const newMethodData = { ...currentData };

            quadrants.forEach(quad => {
                newMethodData[quad] = newMethodData[quad].map(tooth => {
                    let updates: Partial<ToothData> = {};

                    if (mode === 'all_missing') {
                        updates = { isMissing: true, isPrimary: false };
                    } else if (mode === 'reset') {
                        updates = { isMissing: false, isPrimary: false };
                    } else if (mode === 'all_primary') {
                        // 1-5 to Primary (A-E), 6-8 to Missing
                        if (tooth.id <= 5) {
                            updates = { isMissing: false, isPrimary: true };
                        } else {
                            updates = { isMissing: true, isPrimary: false };
                        }
                    }

                    return { ...tooth, ...updates };
                });
            });

            return {
                ...prev,
                [measurementMethod]: newMethodData
            };
        });
        setIsDirty(true);
    };

    const handleConfirmDelete = async () => {
        setAllTeethData(prev => ({
            ...prev,
            [measurementMethod]: generateFullMouth()
        }));
        setIsDeleteModalOpen(false);
        setIsDirty(true); // Resetting data is also a change
    };

    const handleDeleteSavedData = async () => {
        try {
            await DentalDB.deleteChart(selectedDate);
            await updateMarkedDates();
            // After deleting from DB, also reset current view
            setAllTeethData({
                '1-point': generateFullMouth(),
                '4-point': generateFullMouth(),
                '6-point': generateFullMouth(),
            });
            setIsDeleteModalOpen(false);
            setIsDirty(false);
            setToast({ message: "保存済みデータを削除しました", type: 'success' });
        } catch (e) {
            console.error("Failed to delete saved data", e);
            setToast({ message: "削除に失敗しました", type: 'error' });
        }
    };

    const handleAddExaminer = async ({ name, role }: { name: string; role: 'dentist' | 'hygienist' }) => {
        const maxOrder = Math.max(0, ...examiners.map((examiner) => examiner.order));
        const newExaminer: Examiner = {
            id: `examiner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            role,
            color: examinerColors[(examiners.length - 1) % examinerColors.length],
            order: maxOrder + 1,
            hidden: false,
        };

        await persistExaminers([...examiners, newExaminer]);
        setSelectedExaminer(newExaminer);
        setIsDirty(true);
        setToast({ message: "担当者を追加しました", type: 'success' });
    };

    const handleUpdateExaminer = async (id: string, updates: Partial<Pick<Examiner, 'name' | 'role'>>) => {
        if (id === NONE_EXAMINER_ID) return;

        const next = await persistExaminers(examiners.map((examiner) => (
            examiner.id === id ? { ...examiner, ...updates } : examiner
        )));
        const updatedSelected = next.find((examiner) => examiner.id === selectedExaminer.id);
        if (updatedSelected) {
            setSelectedExaminer(updatedSelected);
            setIsDirty(true);
        }
        setToast({ message: "担当者を更新しました", type: 'success' });
    };

    const handleMoveExaminer = async (id: string, direction: 'up' | 'down') => {
        if (id === NONE_EXAMINER_ID) return;

        const editable = examiners
            .filter((examiner) => examiner.id !== NONE_EXAMINER_ID)
            .sort((a, b) => a.order - b.order);
        const currentIndex = editable.findIndex((examiner) => examiner.id === id);
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= editable.length) return;

        const reordered = [...editable];
        const [target] = reordered.splice(currentIndex, 1);
        reordered.splice(targetIndex, 0, target);

        await persistExaminers([
            noneExaminer,
            ...reordered.map((examiner, index) => ({ ...examiner, order: index + 1 })),
        ]);
    };

    const handleToggleExaminerHidden = async (id: string, hidden: boolean) => {
        if (id === NONE_EXAMINER_ID) return;

        await persistExaminers(examiners.map((examiner) => (
            examiner.id === id ? { ...examiner, hidden } : examiner
        )));

        if (hidden && selectedExaminer.id === id) {
            setSelectedExaminer(noneExaminer);
            setIsDirty(true);
        }

        setToast({ message: hidden ? "担当者を非表示にしました" : "担当者を再表示しました", type: 'success' });
    };

    const handleDeleteExaminer = async (id: string) => {
        if (id === NONE_EXAMINER_ID) return;

        try {
            await DentalDB.deleteExaminer(id);
            await DentalDB.reassignExaminerInCharts(id);

            const normalized = normalizeExaminers(examiners.filter((examiner) => examiner.id !== id));
            setExaminers(normalized);
            await DentalDB.saveAllExaminers(toExaminerRecords(normalized));

            if (selectedExaminer.id === id) {
                setSelectedExaminer(noneExaminer);
                setIsDirty(true);
            }

            setComparisonData(prev => {
                const next: Record<string, any> = {};
                Object.keys(prev).forEach((date) => {
                    const record = prev[date] as any;
                    next[date] = record?.examinerId === id
                        ? {
                            ...record,
                            examinerId: NONE_EXAMINER_ID,
                            examinerName: noneExaminer.name,
                            examinerColor: noneExaminer.color,
                            examinerRole: noneExaminer.role,
                        }
                        : record;
                });
                return next;
            });

            setToast({ message: "担当者を削除し、過去検査を担当無しへ変更しました", type: 'success' });
        } catch (error) {
            console.error("Failed to delete examiner", error);
            setToast({ message: "担当者の削除に失敗しました", type: 'error' });
        }
    };

    // Load latest history data (including tooth status)
    const handleLoadLatestHistory = async () => {
        try {
            const dates = await DentalDB.getAllDates();
            if (dates.length === 0) {
                setToast({ message: '保存された検査データがありません', type: 'error' });
                return;
            }
            // Find the most recent date (dates are sorted descending)
            const latestDate = dates[0];
            const record = await DentalDB.getChart(latestDate);
            if (record) {
                setAllTeethData(record.data);
                setToast({ message: `${latestDate.replace(/-/g, '/')} の検査データを読み込みました`, type: 'info' });
                setIsDirty(true);
            } else {
                setToast({ message: '検査データの読み込みに失敗しました', type: 'error' });
            }
        } catch (error) {
            console.error('Failed to load latest history', error);
            setToast({ message: '検査データの読み込みに失敗しました', type: 'error' });
        }
    };

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 2.0));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.3));

    // --- Pinch Zoom Handlers ---
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            // Calculate initial distance
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchStartDist.current = dist;
            startZoomLevel.current = zoomLevel;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && touchStartDist.current > 0) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scale = dist / touchStartDist.current;
            // Apply scale to the initial zoom level
            const newZoom = Math.min(Math.max(startZoomLevel.current * scale, 0.3), 3.0);
            setZoomLevel(newZoom);
        }
    };

    const goLeft = () => {
        if (currentQuadrant === 'UL') setCurrentQuadrant('UR');
        if (currentQuadrant === 'LL') setCurrentQuadrant('LR');
    };

    const goRight = () => {
        if (currentQuadrant === 'UR') setCurrentQuadrant('UL');
        if (currentQuadrant === 'LR') setCurrentQuadrant('LL');
    };

    const goDown = () => {
        if (currentQuadrant === 'UL') setCurrentQuadrant('LL');
        if (currentQuadrant === 'UR') setCurrentQuadrant('LR');
    };

    const goUp = () => {
        if (currentQuadrant === 'LL') setCurrentQuadrant('UL');
        if (currentQuadrant === 'LR') setCurrentQuadrant('UR');
    };

    // Compare Logic
    const handleCompareClick = () => {
        if (isCompareMode) {
            setIsCompareMode(false);
            setCompareTargetDates([]);
            setComparisonData({});
        } else {
            setIsCompareListOpen(true);
            // Initialize with empty selection or keep previous? Let's start fresh or keep.
            // setCompareTargetDates([]); // Uncomment to reset every time
        }
    };

    const handleCompareDateToggle = (date: string) => {
        setCompareTargetDates(prev => {
            if (prev.includes(date)) {
                return prev.filter(d => d !== date);
            } else {
                return [...prev, date];
            }
        });
    };

    const handleConfirmComparison = async () => {
        if (compareTargetDates.length === 0) {
            setToast({ message: "比較する日付を選択してください", type: 'error' });
            return;
        }
        setIsCompareListOpen(false);
        await loadComparisonData(compareTargetDates);
        setIsCompareMode(true);
    };

    const getTranslate = () => {
        switch (currentQuadrant) {
            case 'UR': return 'translate(0%, 0%)';
            case 'UL': return 'translate(-50%, 0%)';
            case 'LR': return 'translate(0%, -50%)';
            case 'LL': return 'translate(-50%, -50%)';
        }
    };

    const showLeftControls = currentQuadrant === 'UL' || currentQuadrant === 'LL';
    const showRightControls = currentQuadrant === 'UR' || currentQuadrant === 'LR';
    const isLower = currentQuadrant === 'LL' || currentQuadrant === 'LR';

    const RedVerticalButton = () => (
        <button
            onPointerDown={currentQuadrant.startsWith('U') ? goDown : goUp}
            className={`w-10 h-10 flex items-center justify-center bg-red-500 text-white rounded-md shadow-md hover:bg-red-600 active:bg-red-700 transition-all duration-300`}
            aria-label={currentQuadrant.startsWith('U') ? "下顎へ移動" : "上顎へ移動"}
        >
            {currentQuadrant.startsWith('U') ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
            )}
        </button>
    );

    // Render content based on mode and method
    const renderContent = () => {
        if (isPreviewMode) {
            if (isHistoryPreview) {
                return <HistoryMockPreview zoomLevel={zoomLevel} />;
            }
            return (
                <div
                    className="w-full bg-transparent print:p-0 print:bg-white print:overflow-visible touch-pan-x touch-pan-y"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={() => { touchStartDist.current = 0; }}
                >
                    {/* Preview chart tools */}
                    {!isPisaPreview && (
                        <div className="max-w-[1100px] w-full mx-auto mt-4 px-8 flex flex-wrap justify-end gap-2 print:hidden select-none">
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-800 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={previewPlaqueMode === 'plaque-only'}
                                        onChange={(e) => setPreviewPlaqueMode(e.target.checked ? 'plaque-only' : 'all')}
                                        className="w-4 h-4 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span>プラークのみ</span>
                                </label>
                                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-800 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={previewPlaqueMode === 'plaque-none'}
                                        onChange={(e) => setPreviewPlaqueMode(e.target.checked ? 'plaque-none' : 'all')}
                                        className="w-4 h-4 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span>プラークなし</span>
                                </label>
                            </div>
                            {measurementMethod === '6-point' && (
                                <label className="flex items-center gap-1.5 text-sm font-bold text-slate-800 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={showFurcation}
                                        onChange={(e) => setShowFurcation(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-400 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span>根分岐部病変を表示する</span>
                                </label>
                            )}
                            <button
                                onPointerDown={handleCopyPreviewImage}
                                disabled={isCopyingPreview}
                                className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-700 shadow-sm hover:bg-indigo-700 active:scale-95 disabled:bg-indigo-300 disabled:border-indigo-300 disabled:active:scale-100 transition-all"
                                title="プレビュー表を画像としてコピー"
                                aria-label="プレビュー表を画像としてコピー"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6A2.25 2.25 0 0 1 10.5 3.75h7.5A2.25 2.25 0 0 1 20.25 6v7.5A2.25 2.25 0 0 1 18 15.75h-1.5" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 10.5A2.25 2.25 0 0 1 6 8.25h7.5a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-7.5Z" />
                                </svg>
                                <span>{isCopyingPreview ? 'コピー中' : '画像をコピー'}</span>
                            </button>
                        </div>
                    )}
                    {/* Wrapper for scrolling: ensure min dimensions based on scaled content */}
                    <div
                        className="flex justify-center items-start p-8"
                        style={{
                            minWidth: `${(1100 * zoomLevel) + 64}px`, // 1100px base width * zoom + padding
                            minHeight: `${(previewContentHeight * zoomLevel) + 64}px`
                        }}
                    >
                        <div
                            ref={previewContentRef}
                            className="flex flex-col gap-8 items-center origin-top shadow-none print:shadow-none print:transform-none"
                            style={{
                                transform: `scale(${zoomLevel})`,
                                transformOrigin: 'top center',
                                width: '1100px',     // Fixed width to maintain aspect ratio and preventing reflow on zoom
                                minWidth: '1100px'
                            }}
                        >
                            {/* Main Chart or PISA Preview */}
                            <div className="bg-white shadow-xl print:shadow-none w-full">
                                {isPisaPreview ? (
                                    <PisaPreview
                                        data={allTeethData['6-point']}
                                        date={selectedDate}
                                        method={'6-point'}
                                        examiner={selectedExaminer}
                                    />
                                ) : (
                                    <DentalChartPrintView
                                        data={allTeethData[measurementMethod]}
                                        date={selectedDate}
                                        method={measurementMethod}
                                        examiner={selectedExaminer}
                                        showFurcation={showFurcation}
                                        plaqueViewMode={previewPlaqueMode}
                                    />
                                )}
                            </div>

                            {/* Comparison Charts */}
                            {isCompareMode && compareTargetDates.map(date => {
                                // record contains data and examiner info
                                const record = comparisonData[date];
                                if (!record) return null;

                                const viewData = record.data[measurementMethod];
                                const recordExaminer = record.examinerId ? {
                                    id: record.examinerId,
                                    name: record.examinerName || '',
                                    color: record.examinerColor || 'bg-slate-500'
                                } : undefined;

                                return (
                                    <div key={date} className="w-full relative animate-fade-in-up">
                                        {/* Comparison Label/Header */}
                                        <div className="absolute -top-8 left-0 flex items-center gap-2">
                                            <div className="bg-indigo-600 text-white px-4 py-1.5 text-sm font-bold rounded-t-lg shadow-sm flex items-center gap-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                </svg>
                                                過去データ: {date.replace(/-/g, '/')}
                                            </div>
                                        </div>

                                        {/* Comparison Chart Body */}
                                        <div className="bg-white shadow-xl border-[6px] border-indigo-200 print:shadow-none print:border-2 print:border-slate-300">
                                            {isPisaPreview ? (
                                                <PisaPreview
                                                    data={record.data['6-point']}
                                                    date={date}
                                                    method={'6-point'}
                                                    examiner={recordExaminer}
                                                />
                                            ) : (
                                                <DentalChartPrintView
                                                    data={viewData}
                                                    date={date}
                                                    method={measurementMethod}
                                                    examiner={recordExaminer}
                                                    showFurcation={showFurcation}
                                                    plaqueViewMode={previewPlaqueMode}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            );
        }

        // Default Editor View
        return (
            <div className="w-full h-full flex items-start justify-center relative print:hidden">
                {/* LEFT CONTROLS COLUMN */}
                {measurementMethod !== '1-point' && (
                    <div className="flex flex-col gap-2 z-20 shrink-0 w-10 self-center">
                        {isLower && showLeftControls && <RedVerticalButton />}
                        <button
                            onPointerDown={goLeft}
                            disabled={!showLeftControls}
                            className={`w-10 h-24 flex items-center justify-center bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 active:bg-blue-800 transition-opacity duration-300 ${showLeftControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            aria-label="左へ移動"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        {!isLower && showLeftControls && <RedVerticalButton />}
                    </div>
                )}

                <div className="flex-1 h-full overflow-hidden relative border border-slate-200 bg-slate-50 rounded-lg shadow-inner">
                    {measurementMethod === '1-point' ? (
                        <div className="w-full min-h-full overflow-auto px-1 py-2 flex items-start justify-center touch-none select-none">
                            <div className="flex justify-center gap-1 w-full max-w-[1120px]">
                                <div className="flex flex-1 min-w-0 gap-[1px] bg-white p-0 rounded border border-slate-300 shadow-sm">
                                    {currentTeethData.UR.map((tooth, index) => (
                                        <Tooth
                                            key={tooth.id}
                                            data={tooth}
                                            lowerData={currentTeethData.LR[index]}
                                            onUpdate={(t) => handleToothUpdate('UR', t)}
                                            onUpdateLower={(t) => handleToothUpdate('LR', t)}
                                            jaw="upper"
                                            method="1-point"
                                        />
                                    ))}
                                </div>
                                <div className="w-2 shrink-0"></div>
                                <div className="flex flex-1 min-w-0 gap-[1px] bg-white p-0 rounded border border-slate-300 shadow-sm">
                                    {currentTeethData.UL.map((tooth, index) => (
                                        <Tooth
                                            key={tooth.id}
                                            data={tooth}
                                            lowerData={currentTeethData.LL[index]}
                                            onUpdate={(t) => handleToothUpdate('UL', t)}
                                            onUpdateLower={(t) => handleToothUpdate('LL', t)}
                                            jaw="upper"
                                            method="1-point"
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div
                            className="flex flex-wrap w-[200%] h-[200%] transition-transform duration-500 ease-in-out will-change-transform"
                            style={{ transform: getTranslate() }}
                        >
                            <div className="w-1/2 h-1/2 flex items-center justify-start bg-slate-100 p-0.5">
                                <div className="bg-white p-0 rounded-lg shadow-sm border border-slate-200 w-full h-full flex flex-col items-center overflow-auto">
                                    <div className="flex w-full h-full gap-[1px] items-start">
                                        {currentTeethData.UR.map(tooth => (
                                            <Tooth key={tooth.id} data={tooth} onUpdate={(t) => handleToothUpdate('UR', t)} jaw="upper" method={measurementMethod} />
                                        ))}
                                        <SideLabels jaw="upper" method={measurementMethod} />
                                    </div>
                                </div>
                            </div>

                            <div className="w-1/2 h-1/2 flex items-center justify-end bg-slate-100 p-0.5">
                                <div className="bg-white p-0 rounded-lg shadow-sm border border-slate-200 w-full h-full flex flex-col items-center overflow-auto">
                                    <div className="flex w-full h-full gap-[1px] items-start">
                                        <SideLabels jaw="upper" method={measurementMethod} />
                                        {currentTeethData.UL.map(tooth => (
                                            <Tooth key={tooth.id} data={tooth} onUpdate={(t) => handleToothUpdate('UL', t)} jaw="upper" method={measurementMethod} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="w-1/2 h-1/2 flex items-center justify-start bg-slate-100 p-0.5">
                                <div className="bg-white p-0 rounded-lg shadow-sm border border-slate-200 w-full h-full flex flex-col items-center overflow-auto">
                                    <div className="flex w-full h-full gap-[1px] items-start">
                                        {currentTeethData.LR.map(tooth => (
                                            <Tooth key={tooth.id} data={tooth} onUpdate={(t) => handleToothUpdate('LR', t)} jaw="lower" method={measurementMethod} />
                                        ))}
                                        <SideLabels jaw="lower" method={measurementMethod} />
                                    </div>
                                </div>
                            </div>

                            <div className="w-1/2 h-1/2 flex items-center justify-end bg-slate-100 p-0.5">
                                <div className="bg-white p-0 rounded-lg shadow-sm border border-slate-200 w-full h-full flex flex-col items-center overflow-auto">
                                    <div className="flex w-full h-full gap-[1px] items-start">
                                        <SideLabels jaw="lower" method={measurementMethod} />
                                        {currentTeethData.LL.map(tooth => (
                                            <Tooth key={tooth.id} data={tooth} onUpdate={(t) => handleToothUpdate('LL', t)} jaw="lower" method={measurementMethod} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT CONTROLS COLUMN */}
                {measurementMethod !== '1-point' && (
                    <div className="flex flex-col gap-2 z-20 shrink-0 w-10 self-center">
                        {isLower && showRightControls && <RedVerticalButton />}
                        <button
                            onPointerDown={goRight}
                            disabled={!showRightControls}
                            className={`w-10 h-24 flex items-center justify-center bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 active:bg-blue-800 transition-opacity duration-300 ${showRightControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            aria-label="右へ移動"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                        {!isLower && showRightControls && <RedVerticalButton />}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="h-[100dvh] w-screen bg-slate-100 flex flex-col font-sans overflow-hidden text-slate-900 relative">
            {/* Toast Notification */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header - Compact (Hidden on print) */}
            <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-50 shrink-0 print:hidden">
                <div className="w-full max-w-[810px] mx-auto px-1.5 py-1.5 flex items-center justify-between gap-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 min-w-[168px]">
                        <div className="flex flex-col">
                            <span className="font-mono font-bold text-slate-400 text-xs leading-tight">000000001</span>
                            <div className="flex items-center gap-2">
                                <span className="font-black text-slate-800 text-lg leading-none">吉田 太郎</span>
                                <span className="text-slate-400 font-bold text-sm">様</span>
                                <button
                                    onPointerDown={() => setIsSettingsOpen(true)}
                                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 shadow-sm active:scale-95 transition-all flex items-center justify-center outline-none"
                                    title="設定"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774a1.125 1.125 0 0 1 .12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.894.15c.542.09.94.56.94 1.109v1.094c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738a1.125 1.125 0 0 1-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.45.12l-.737-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.02-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527a1.125 1.125 0 0 1-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.929-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 0 1 .12-1.45l.774-.773a1.125 1.125 0 0 1 1.45-.12l.738.527c.35.25.806.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                    </svg>
                                </button>
                            </div>
                            <span className="text-slate-500 text-xs font-bold mt-1">（1975/01/01　51歳）</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 justify-center flex-1 min-w-0">
                        <button
                            onPointerDown={() => !isPreviewMode && !isCompareMode && setIsCalendarOpen(true)}
                            disabled={isPreviewMode || isCompareMode}
                            className={`h-9 bg-white border border-slate-200 rounded-lg px-2 text-sm font-black text-slate-800 shadow-sm flex items-center gap-1.5 hover:bg-slate-50 active:bg-slate-100 transition-colors ${isPreviewMode || isCompareMode ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-slate-700">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                            </svg>
                            {selectedDate.replace(/-/g, '/')}
                        </button>

                        {!isPreviewMode && !isCompareMode && (
                            <button
                                onPointerDown={handleLoadLatestHistory}
                                className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-slate-800 shadow-sm active:scale-95 transition-all flex items-center gap-1.5 text-sm font-black"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                                履歴
                            </button>
                        )}

                        {!isPreviewMode && !isCompareMode && (
                            <div className={`
                                h-9 flex items-center gap-1.5 px-2 rounded-lg border shadow-sm transition-all duration-300
                                ${totalMinutes >= 15 
                                    ? 'bg-white border-slate-200' 
                                    : 'bg-orange-50 border-orange-200 animate-pulse-slow'}
                            `}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-800">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                                <button onPointerDown={handleNowClick} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 shadow-sm active:scale-95 transition-all">今</button>
                                <input type="time" value={startTime} onChange={(e) => handleStartTimeChange(e.target.value)} className="bg-transparent border-none focus:ring-0 text-sm font-black text-slate-800 w-[62px] text-center p-0" />
                                <span className="text-slate-500 text-base font-black">〜</span>
                                <input type="time" value={endTime} onChange={(e) => handleEndTimeChange(e.target.value)} className="bg-transparent border-none focus:ring-0 text-sm font-black text-slate-800 w-[62px] text-center p-0" />
                                <span className={`text-sm font-black ${totalMinutes < 15 ? 'text-orange-700' : 'text-slate-800'}`}>{totalMinutes}分</span>
                                <button onPointerDown={handleAdd5Min} className="px-1.5 py-0.5 bg-white border border-slate-200 rounded-md shadow-sm text-blue-600 text-sm font-black hover:bg-blue-50 active:scale-95 transition-all">+5分</button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 justify-end min-w-[84px]">
                        <WithTooltip label={isPreviewMode ? "閉じる" : "プレビュー"} showLabels={showLabels}>
                            <button
                                className={`w-9 h-9 border rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center ${isPreviewMode ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-200'}`}
                                onPointerDown={() => {
                                    if (isPreviewMode) {
                                        setIsPreviewMode(false); setIsPisaPreview(false); setIsHistoryPreview(false); setShowFurcation(false); setPreviewPlaqueMode('all'); setIsCompareMode(false); setCompareTargetDates([]); setZoomLevel(0.7); setPreviewContentHeight(0);
                                    } else {
                                        requestPreviewView('chart');
                                    }
                                }}
                            >
                                {isPreviewMode ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                                )}
                            </button>
                        </WithTooltip>

                        <WithTooltip label={`実施者: ${selectedExaminer.name}`} showLabels={showLabels}>
                            <button
                                onPointerDown={() => setIsExaminerModalOpen(true)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shadow-md active:scale-95 transition-all border-2 border-white ${selectedExaminer.color}`}
                            >
                                {getExaminerShortLabel(selectedExaminer)}
                            </button>
                        </WithTooltip>
                    </div>
                </div>

                <div className="w-full max-w-[810px] mx-auto px-1.5 py-1.5 flex items-center justify-between gap-1.5">
                    {/* Left Group */}
                    <div className="flex items-center gap-2 shrink-0 min-w-0">
                        <MethodSelector current={measurementMethod} onChange={(m) => { setMeasurementMethod(m); if (m !== '6-point') setIsPisaPreview(false); }} />
                        <div className={`${measurementMethod === '1-point' || isPreviewMode || isCompareMode ? 'hidden' : 'block'}`}>
                            <MiniMap current={currentQuadrant} onSelect={setCurrentQuadrant} />
                        </div>
                        {!isPreviewMode && !isCompareMode && (
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-black text-slate-600 whitespace-nowrap">一括入力</span>
                                <div className="flex items-center gap-1">
                                    {([1, 2, 3, 4, 5] as const).map(value => (
                                        <button
                                            key={value}
                                            onPointerDown={() => handleBulkPocketDepth(value)}
                                            className="h-9 w-9 rounded-lg bg-white border border-slate-200 text-slate-800 text-base font-black shadow-sm hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 active:scale-95 transition-all"
                                            title={`全顎のポケットに${value}mmを入力`}
                                        >
                                            {value}
                                        </button>
                                    ))}
                                    <div className="w-px h-7 bg-slate-200 mx-0.5" />
                                    <button onPointerDown={() => handleBulkToggleMeasurement('plaque')} className="h-9 px-2 rounded-lg bg-white border border-slate-200 text-rose-600 text-xs font-black shadow-sm hover:bg-rose-50 hover:border-rose-200 active:scale-95 transition-all" title="全顎のプラークをON/OFF">プラーク</button>
                                    <button onPointerDown={() => handleBulkToggleMeasurement('bleeding')} className="h-9 px-2 rounded-lg bg-white border border-slate-200 text-red-600 text-xs font-black shadow-sm hover:bg-red-50 hover:border-red-200 active:scale-95 transition-all" title="全顎の出血をON/OFF">出血</button>
                                    <button onPointerDown={() => handleBulkToggleMeasurement('pus')} className="h-9 px-2 rounded-lg bg-white border border-slate-200 text-slate-800 text-xs font-black shadow-sm hover:bg-slate-100 hover:border-slate-300 active:scale-95 transition-all" title="全顎の排膿をON/OFF">排膿</button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {(isPreviewMode || isCompareMode) && (
                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm h-9">
                                <button onPointerDown={handleZoomOut} className="w-8 h-full flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded active:bg-slate-200 transition-colors font-bold text-lg leading-none pb-1" title="縮小">−</button>
                                <span className="text-xs font-bold w-12 text-center text-slate-700 select-none">{Math.round(zoomLevel * 100)}%</span>
                                <button onPointerDown={handleZoomIn} className="w-8 h-full flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded active:bg-slate-200 transition-colors font-bold text-lg leading-none pb-1" title="拡大">+</button>
                            </div>
                        )}
                        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-lg p-0.5 h-9" role="group" aria-label="表示切り替え">
                            <WithTooltip label="チャート" showLabels={showLabels}>
                                <button onClick={() => requestPreviewView('chart')} title="チャート" aria-label="チャート" aria-pressed={isPreviewMode && !isHistoryPreview && !isPisaPreview && !isCompareMode} className={`w-9 h-8 rounded-md flex items-center justify-center transition-colors ${isPreviewMode && !isHistoryPreview && !isPisaPreview && !isCompareMode ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-blue-50'}`}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></svg>
                                </button>
                            </WithTooltip>
                            <WithTooltip label="経過" showLabels={showLabels}>
                                <button onClick={() => requestPreviewView('history')} title="経過" aria-label="経過" aria-pressed={isPreviewMode && isHistoryPreview} className={`w-9 h-8 rounded-md flex items-center justify-center transition-colors ${isPreviewMode && isHistoryPreview ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-blue-50'}`}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" aria-hidden="true"><path d="M4 3v17h17M7 15l4-5 4 3 5-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </button>
                            </WithTooltip>
                            <button onClick={() => requestPreviewView('compare')} title="比較" aria-pressed={isCompareMode || isCompareListOpen} className={`px-3 h-8 rounded-md text-xs font-bold transition-colors ${isCompareMode || isCompareListOpen ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-blue-50'}`}>比較</button>
                            {isPreviewMode && measurementMethod === '6-point' && <button onClick={() => { setIsHistoryPreview(false); setIsPisaPreview(true); setIsCompareMode(false); setCompareTargetDates([]); }} aria-pressed={!isHistoryPreview && isPisaPreview} className={`px-3 h-8 rounded-md text-xs font-bold transition-colors ${!isHistoryPreview && isPisaPreview ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-blue-50'}`}>PISA</button>}
                        </div>
                        {/* Bulk Status (Edit Mode only) */}
                        {!isPreviewMode && !isCompareMode && (
                            <div className="flex flex-col gap-1 bg-teal-50 border border-teal-200 rounded-lg px-1.5 py-1 shadow-sm">
                                <span className="text-xs font-black text-teal-700 leading-none">歯牙状態</span>
                                <div className="flex items-center gap-1.5">
                                <WithTooltip label="全顎欠損" showLabels={showLabels}>
                                    <button onPointerDown={() => handleBulkStatusChange('all_missing')} className="h-7 px-2 text-[11px] font-black bg-white text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-colors">欠損</button>
                                </WithTooltip>
                                <WithTooltip label="全顎乳歯" showLabels={showLabels}>
                                    <button onPointerDown={() => handleBulkStatusChange('all_primary')} className="h-7 px-2 text-[11px] font-black bg-white text-green-600 border border-slate-200 rounded-lg hover:bg-green-50 shadow-sm transition-colors">乳歯</button>
                                </WithTooltip>
                                <WithTooltip label="全て永久歯に戻す" showLabels={showLabels}>
                                    <button onPointerDown={() => handleBulkStatusChange('reset')} className="h-7 px-2 text-[11px] font-black bg-white text-teal-600 border border-slate-200 rounded-lg hover:bg-teal-50 shadow-sm transition-colors">解除</button>
                                </WithTooltip>
                                </div>
                            </div>
                        )}
                        {!isPreviewMode && (
                            <WithTooltip label="保存" showLabels={showLabels}>
                                <button className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-slate-800 hover:text-blue-600 flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all text-xs font-black" onPointerDown={() => handleSave()}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                                    保存
                                </button>
                            </WithTooltip>
                        )}

                        {!isPreviewMode && (
                            <WithTooltip label="リセット / 削除" showLabels={showLabels}>
                                <button className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-red-600 hover:bg-red-50 flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all text-xs font-black" onPointerDown={() => setIsDeleteModalOpen(true)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-8 0 1 12h8l1-12M10 11v5m4-5v5" /></svg>
                                    削除
                                </button>
                            </WithTooltip>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 w-full overflow-auto relative bg-slate-100 print:bg-white print:p-0 print:block">
                {renderContent()}
            </main>

            {/* Save Confirmation Modal */}
            {isSaveConfirmModalOpen && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] print:hidden">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-fade-in-up">
                        <div className="p-5">
                            <div className="flex items-center gap-3 mb-3 text-indigo-600">
                                <div className="p-2 bg-indigo-100 rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                                    </svg>
                                </div>
                                <h3 className="font-bold text-lg text-slate-800">保存確認</h3>
                            </div>
                            <p className="text-slate-600 text-sm leading-relaxed font-bold">
                                保存してプレビュー画面に移行しますか？
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-5 py-4 bg-slate-50 border-t border-slate-100">
                            <button
                                onPointerDown={() => setIsSaveConfirmModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                いいえ
                            </button>
                            <button
                                onPointerDown={handleSaveAndPreview}
                                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all active:scale-95"
                            >
                                はい
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset or Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] print:hidden">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
                        <div className="p-5">
                            <div className="flex items-center gap-3 mb-3 text-red-600">
                                <div className="p-2 bg-red-100 rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                    </svg>
                                </div>
                                <h3 className="font-bold text-lg text-slate-800">リセット / 削除</h3>
                            </div>
                            <p className="text-slate-600 text-sm leading-relaxed mb-4">
                                実行する操作を選択してください。
                            </p>
                            
                            <div className="flex flex-col gap-2">
                                <button 
                                    onPointerDown={handleConfirmDelete}
                                    className="w-full flex flex-col items-start p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                                >
                                    <span className="text-sm font-bold text-slate-800">編集中データのリセット</span>
                                    <span className="text-xs text-slate-500">入力値を空にします。保存済みデータは削除されません。</span>
                                </button>
                                
                                {markedDates.includes(selectedDate) && (
                                    <button 
                                        onPointerDown={handleDeleteSavedData}
                                        className="w-full flex flex-col items-start p-3 rounded-lg border border-red-100 bg-red-50/30 hover:bg-red-50 transition-colors"
                                    >
                                        <span className="text-sm font-bold text-red-600">保存済みデータの削除</span>
                                        <span className="text-xs text-red-400">この日付の保存データを完全に削除します。</span>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-end px-5 py-4 bg-slate-50 border-t border-slate-100">
                            <button
                                onPointerDown={() => setIsDeleteModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Unsaved Changes Confirmation Modal */}
            {isUnsavedModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px] print:hidden">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-fade-in-up">
                        <div className="p-5">
                            <div className="flex items-center gap-3 mb-3 text-amber-500">
                                <div className="p-2 bg-amber-100 rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                                    </svg>
                                </div>
                                <h3 className="font-bold text-lg text-slate-800">未保存の変更</h3>
                            </div>
                            <p className="text-slate-600 text-sm leading-relaxed font-bold">
                                変更が保存されていません。移動する前に保存しますか？
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 p-5 bg-slate-50 border-t border-slate-100">
                            <button
                                onPointerDown={async () => {
                                    const success = await handleSave();
                                    if (success && pendingDate) {
                                        setSelectedDate(pendingDate);
                                        setIsUnsavedModalOpen(false);
                                        setPendingDate(null);
                                    }
                                }}
                                className="w-full py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all active:scale-95"
                            >
                                保存して移動
                            </button>
                            <button
                                onPointerDown={() => {
                                    if (pendingDate) {
                                        setSelectedDate(pendingDate);
                                        setIsUnsavedModalOpen(false);
                                        setPendingDate(null);
                                    }
                                }}
                                className="w-full py-2.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-all active:scale-95"
                            >
                                保存せず移動
                            </button>
                            <button
                                onPointerDown={() => {
                                    setIsUnsavedModalOpen(false);
                                    setPendingDate(null);
                                }}
                                className="w-full py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                キャンセル
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Compare Date Selection Modal */}
            {isCompareListOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200 animate-fade-in-up flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-lg text-slate-800">比較するデータを選択</h3>
                            <button onPointerDown={() => setIsCompareListOpen(false)} className="text-slate-500 hover:text-slate-800">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto p-2">
                            {markedDates.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">データが見つかりません</div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {markedDates.map(date => {
                                        const isCurrent = date === selectedDate;
                                        const isSelected = compareTargetDates.includes(date);

                                        return (
                                            <button
                                                key={date}
                                                onPointerDown={() => !isCurrent && handleCompareDateToggle(date)}
                                                disabled={isCurrent}
                                                className={`
                                            w-full text-left px-4 py-3 rounded-lg flex items-center justify-between border transition-all
                                            ${isCurrent
                                                        ? 'bg-slate-100 border-slate-200 cursor-default opacity-60'
                                                        : isSelected
                                                            ? 'bg-indigo-50 border-indigo-300 shadow-inner'
                                                            : 'bg-white border-slate-200 hover:bg-slate-50'
                                                    }
                                        `}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {/* Checkbox-like indicator */}
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                                                ${isCurrent ? 'border-slate-300 bg-slate-200' :
                                                            isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}
                                            `}>
                                                        {(isSelected || isCurrent) && (
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 ${isCurrent ? 'text-slate-400' : 'text-white'}`}>
                                                                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <span className={`font-bold ${isCurrent ? 'text-slate-500' : isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                                                        {date.replace(/-/g, '/')}
                                                    </span>
                                                </div>
                                                {isCurrent && <span className="text-xs font-bold bg-slate-200 text-slate-500 px-2 py-1 rounded">表示中</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        {/* Footer Actions */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button
                                onPointerDown={() => setIsCompareListOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onPointerDown={handleConfirmComparison}
                                disabled={compareTargetDates.length === 0}
                                className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-all flex items-center gap-2
                            ${compareTargetDates.length === 0
                                        ? 'bg-slate-400 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
                                    }
                        `}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v8.25A2.25 2.25 0 0 0 6 16.5h2.25m8.25-8.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5m8.25-8.25h-6a2.25 2.25 0 0 0-2.25 2.25v6" />
                                </svg>
                                比較を表示 ({compareTargetDates.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Calendar Modal */}
            <CalendarModal
                isOpen={isCalendarOpen}
                onClose={() => setIsCalendarOpen(false)}
                onSelectDate={handleSelectDate}
                selectedDate={selectedDate}
                markedDates={markedDates}
            />

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            <ExaminerModal
                isOpen={isExaminerModalOpen}
                onClose={() => setIsExaminerModalOpen(false)}
                examiners={examiners}
                onSelect={(examiner) => {
                    setSelectedExaminer(examiner);
                    setIsExaminerModalOpen(false);
                    setIsDirty(true);
                }}
                selectedId={selectedExaminer.id}
                onAdd={handleAddExaminer}
                onUpdate={handleUpdateExaminer}
                onMove={handleMoveExaminer}
                onToggleHidden={handleToggleExaminerHidden}
                onDelete={handleDeleteExaminer}
            />

        </div>
    );
};

export default App;
