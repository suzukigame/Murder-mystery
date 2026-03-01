import { useState, useEffect, useCallback } from 'react';

const ACHIEVEMENTS_STORAGE_KEY = 'nexus_war_achievements';

export function useAchievements() {
    // 取得済みの実績IDリスト
    const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);

    // 初回マウント時にLocalStorageから読み込み
    useEffect(() => {
        try {
            const saved = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
            if (saved) {
                setUnlockedAchievements(JSON.parse(saved));
            }
        } catch (e) {
            console.error('Failed to load achievements from local storage', e);
        }
    }, []);

    /**
     * 新しい実績をアンロックし、LocalStorageに保存する
     */
    const unlockAchievement = useCallback((achievementId: string) => {
        setUnlockedAchievements(prev => {
            if (prev.includes(achievementId)) {
                return prev; // すでに解放済み
            }
            const newAchievements = [...prev, achievementId];
            try {
                localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(newAchievements));
            } catch (e) {
                console.error('Failed to save achievement to local storage', e);
            }
            return newAchievements;
        });
    }, []);

    /**
     * 特定の条件（実績）を満たしているか確認する
     */
    const hasAchievement = useCallback((achievementId: string) => {
        return unlockedAchievements.includes(achievementId);
    }, [unlockedAchievements]);

    return {
        unlockedAchievements,
        unlockAchievement,
        hasAchievement
    };
}
