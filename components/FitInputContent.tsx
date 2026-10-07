import React, { useLayoutEffect, useRef, useState } from 'react';

/** Fit the complete input table, including its last row, into the available area. */
const FitInputContent: React.FC<{ children: React.ReactNode; minWidth: number }> = ({ children, minWidth }) => {
    const areaRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [area, setArea] = useState({ width: minWidth, height: 0 });
    const [contentHeight, setContentHeight] = useState(0);
    const naturalWidth = Math.max(minWidth, area.width);
    const scale = Math.min(1, area.width / naturalWidth, contentHeight ? area.height / contentHeight : 1);

    useLayoutEffect(() => {
        const areaNode = areaRef.current;
        const contentNode = contentRef.current;
        if (!areaNode || !contentNode) return;
        const observer = new ResizeObserver(() => {
            setArea({ width: areaNode.clientWidth, height: areaNode.clientHeight });
            setContentHeight(contentNode.scrollHeight);
        });
        observer.observe(areaNode);
        observer.observe(contentNode);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={areaRef} className="relative h-full w-full min-h-0 min-w-0 overflow-hidden" data-input-fit>
            <div ref={contentRef} className="absolute top-0 origin-top-left" style={{
                width: naturalWidth,
                left: Math.max(0, (area.width - naturalWidth * scale) / 2),
                transform: `scale(${scale})`
            }}>
                {children}
            </div>
        </div>
    );
};

export default FitInputContent;
