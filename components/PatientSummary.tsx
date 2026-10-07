import React from 'react';

interface PatientSummaryProps {
    patient: { number: string; kana: string; name: string; birthDate: string };
}

const PatientSummary: React.FC<PatientSummaryProps> = ({ patient }) => {
    const [year, month, day] = patient.birthDate.split('-').map(Number);
    const today = new Date();
    const birthdayPending = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
    const age = today.getFullYear() - year - Number(birthdayPending);

    return (
        <div className="flex shrink-0 items-center gap-3 text-slate-800" aria-label="患者情報">
            <div className="leading-tight">
                <div className="text-[10px] text-slate-500">患者番号</div>
                <div className="font-mono text-xs font-semibold tabular-nums">{patient.number}</div>
            </div>
            <div className="leading-tight">
                <div className="text-[10px] text-slate-500" aria-label="フリガナ">{patient.kana}</div>
                <div className="text-sm font-bold" aria-label="漢字氏名">{patient.name}</div>
            </div>
            <div className="leading-tight">
                <div className="text-[10px] text-slate-500">生年月日・年齢</div>
                <div className="whitespace-nowrap text-xs tabular-nums">{patient.birthDate.replace(/-/g, '/')} <span className="ml-1 font-semibold">{age}歳</span></div>
            </div>
        </div>
    );
};

export default PatientSummary;
