import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import { AVAILABLE_SKINS, ISkinData, getSkinImagePath } from '../data/skins';

interface ISkinSelectorModalProps {
    currentSkinId: string;
    unlockedAchievements: string[];
    onSelect: (skinId: string) => void;
    onClose: () => void;
}

/**
 * スキン選択モーダル
 * 利用可能なスキンをサムネイル一覧で表示し、選択させるコンポーネント。
 * シークレットキャラクターは未解放時にシルエット表示される。
 */
const SkinSelectorModal: React.FC<ISkinSelectorModalProps> = ({ currentSkinId, unlockedAchievements, onSelect, onClose }) => {
    const [hintText, setHintText] = useState<string | null>(null);

    /**
     * スキンが解放済みかどうかを判定する
     */
    const isSkinUnlocked = (skin: ISkinData): boolean => {
        if (!skin.isSecret) return true; // 初期キャラは常に解放済み
        if (!skin.unlockCondition) return true;
        return unlockedAchievements.includes(skin.unlockCondition);
    };

    const handleSkinClick = (skin: ISkinData) => {
        if (isSkinUnlocked(skin)) {
            onSelect(skin.id);
            onClose();
        } else {
            // 未解放の場合はヒントテキストを表示
            setHintText(skin.unlockHint || '条件を達成して解放しよう！');
            setTimeout(() => setHintText(null), 3000);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="skin-selector-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <span>アバター選択</span>
                    <button className="modal-close" onClick={onClose}><X size={16} /></button>
                </div>
                {hintText && (
                    <div className="unlock-hint-banner">
                        <Lock size={14} />
                        <span>{hintText}</span>
                    </div>
                )}
                <div className="skin-grid">
                    {AVAILABLE_SKINS.map((skin: ISkinData) => {
                        const unlocked = isSkinUnlocked(skin);
                        return (
                            <div
                                key={skin.id}
                                className={`skin-card ${skin.id === currentSkinId ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`}
                                onClick={() => handleSkinClick(skin)}
                                title={!unlocked ? (skin.unlockHint || '???') : skin.name}
                            >
                                <img
                                    src={getSkinImagePath(skin.id)}
                                    alt={unlocked ? skin.name : '???'}
                                    className={`skin-thumbnail ${!unlocked ? 'silhouette' : ''}`}
                                />
                                {!unlocked && (
                                    <div className="lock-overlay">
                                        <Lock size={24} />
                                    </div>
                                )}
                                <span className="skin-name">{unlocked ? skin.name : '???'}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SkinSelectorModal;
