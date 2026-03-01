/**
 * アバタースキンのデータ定義
 * 利用可能なスキンの一覧とメタデータを管理する。
 */
export interface ISkinData {
    id: string;
    name: string;
    imagePath: string;
}

/** 利用可能なスキン一覧 */
export const AVAILABLE_SKINS: ISkinData[] = [
    { id: 'default_01', name: 'Agent Alpha', imagePath: '/assets/avatars/default_01.png' },
    { id: 'skin_02', name: 'Agent Sigma', imagePath: '/assets/avatars/skin_02.png' },
    { id: 'skin_03', name: 'Shadow', imagePath: '/assets/avatars/skin_03.png' },
    { id: 'chibigirl', name: 'chibigirl', imagePath: '/assets/avatars/chibigirl.png' },
    { id: 'gocho', name: 'gocho', imagePath: '/assets/avatars/gocho.png' },
];

/**
 * skinIdに対応する画像パスを返す。見つからない場合はデフォルトを返す。
 */
export function getSkinImagePath(skinId?: string): string {
    const skin = AVAILABLE_SKINS.find(s => s.id === skinId);
    return skin ? skin.imagePath : AVAILABLE_SKINS[0].imagePath;
}
