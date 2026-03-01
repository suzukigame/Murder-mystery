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
    { id: 'gocho', name: 'HIPHOP伍長', imagePath: '/assets/avatars/HIPHOP伍長.png' },
    { id: 'gocho_surprise', name: 'びっくり伍長', imagePath: '/assets/avatars/びっくり伍長.png' },
    { id: 'ore_chan_doji', name: '俺ちゃん童貞', imagePath: '/assets/avatars/俺ちゃんどーじ.png' },
    { id: 'gocho_howling', name: '吠える伍長', imagePath: '/assets/avatars/吠える伍長.png' },
    { id: 'maou', name: '魔王', imagePath: '/assets/avatars/魔王.png' },
    { id: 'gocho_sulking', name: '拗ね伍長', imagePath: '/assets/avatars/拗ね伍長.png' },
];

/**
 * skinIdに対応する画像パスを返す。見つからない場合はデフォルトを返す。
 */
export function getSkinImagePath(skinId?: string): string {
    const skin = AVAILABLE_SKINS.find(s => s.id === skinId);
    return skin ? skin.imagePath : AVAILABLE_SKINS[0].imagePath;
}
