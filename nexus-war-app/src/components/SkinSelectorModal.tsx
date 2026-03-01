import React from 'react';
import { X } from 'lucide-react';
import { AVAILABLE_SKINS, ISkinData, getSkinImagePath } from '../data/skins';

interface ISkinSelectorModalProps {
    currentSkinId: string;
    onSelect: (skinId: string) => void;
    onClose: () => void;
}

/**
 * スキン選択モーダル
 * 利用可能なスキンをサムネイル一覧で表示し、選択させるコンポーネント。
 */
const SkinSelectorModal: React.FC<ISkinSelectorModalProps> = ({ currentSkinId, onSelect, onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="skin-selector-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <span>アバター選択</span>
                    <button className="modal-close" onClick={onClose}><X size={16} /></button>
                </div>
                <div className="skin-grid">
                    {AVAILABLE_SKINS.map((skin: ISkinData) => (
                        <div
                            key={skin.id}
                            className={`skin-card ${skin.id === currentSkinId ? 'selected' : ''}`}
                            onClick={() => { onSelect(skin.id); onClose(); }}
                        >
                            <img
                                src={getSkinImagePath(skin.id)}
                                alt={skin.name}
                                className="skin-thumbnail"
                            />
                            <span className="skin-name">{skin.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SkinSelectorModal;
