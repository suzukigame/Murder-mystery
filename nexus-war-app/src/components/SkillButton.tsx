import React, { useState, useRef, useCallback } from 'react';

/**
 * SkillButton コンポーネントの Props
 * 既存の button 要素の Props を継承しつつ、tooltip を追加
 */
interface ISkillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** ツールチップに表示する説明テキスト */
    tooltip: string;
}

/** 長押し判定までの時間 (ms) */
const LONG_PRESS_DURATION = 500;

/**
 * スキル説明ツールチップ付きボタンコンポーネント
 * PC: マウスホバーでツールチップ表示
 * スマホ: 500ms長押しでツールチップ表示（スキルは発動しない）
 */
const SkillButton: React.FC<ISkillButtonProps> = ({ tooltip, children, onClick, ...rest }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const longPressTriggered = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- PC: マウスホバー ---
    const handleMouseEnter = useCallback(() => {
        setShowTooltip(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setShowTooltip(false);
    }, []);

    // --- スマホ: 長押し検出 ---
    const handleTouchStart = useCallback((_e: React.TouchEvent<HTMLButtonElement>) => {
        longPressTriggered.current = false;
        timerRef.current = setTimeout(() => {
            longPressTriggered.current = true;
            setShowTooltip(true);
        }, LONG_PRESS_DURATION);
    }, []);

    const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (longPressTriggered.current) {
            // 長押しが発動した場合はクリック（スキル発動）を阻止
            e.preventDefault();
            // ツールチップを少し表示してから消す
            setTimeout(() => setShowTooltip(false), 1500);
        }
    }, []);

    const handleTouchMove = useCallback(() => {
        // 指が動いたらキャンセル
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        // 長押し直後のクリックイベントを無視
        if (longPressTriggered.current) {
            longPressTriggered.current = false;
            return;
        }
        onClick?.(e);
    }, [onClick]);

    return (
        <div className="skill-button-wrapper">
            <button
                {...rest}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
            >
                {children}
            </button>
            {showTooltip && (
                <div className="skill-tooltip">
                    {tooltip}
                </div>
            )}
        </div>
    );
};

export default SkillButton;
