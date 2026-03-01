/**
 * アバタースキンのデータ定義
 * 利用可能なスキンの一覧とメタデータを管理する。
 */
export interface ISkinData {
    id: string;
    name: string;
    imagePath: string;
    /** シークレットキャラクターかどうか（未解放時にシルエットになるか） */
    isSecret?: boolean;
    /** キャラクターを解放するための実績IDや条件文字列 */
    unlockCondition?: string;
    /** UI等で提示する解放条件のヒントテキスト */
    unlockHint?: string;
}

/** 利用可能なスキン一覧 */
export const AVAILABLE_SKINS: ISkinData[] = [
    // 初期から選択可能なキャラクター
    { id: 'default_01', name: 'Agent Alpha', imagePath: '/assets/avatars/default_01.png' },
    { id: 'skin_02', name: 'Agent Sigma', imagePath: '/assets/avatars/skin_02.png' },
    { id: 'skin_03', name: 'Shadow', imagePath: '/assets/avatars/skin_03.png' },

    // 実績などで解放されるシークレットキャラクター
    {
        id: 'chibigirl',
        name: 'イリス・ナイト',
        imagePath: '/assets/avatars/イリス・ナイト.png',
        isSecret: true,
        unlockCondition: 'win_hacker_1',
        unlockHint: 'ハッカー陣営として1回勝利する'
    },
    {
        id: 'gocho',
        name: 'HIPHOP伍長',
        imagePath: '/assets/avatars/HIPHOP伍長.png',
        isSecret: true,
        unlockCondition: 'win_employee_3',
        unlockHint: '社員陣営として3回勝利する'
    },
    {
        id: 'gocho_surprise',
        name: 'びっくり伍長',
        imagePath: '/assets/avatars/びっくり伍長.png',
        isSecret: true,
        unlockCondition: 'play_game_5',
        unlockHint: 'ゲームを累計5回プレイする'
    },
    {
        id: 'ore_chan_doji',
        name: '俺ちゃんどーじ',
        imagePath: '/assets/avatars/俺ちゃんどーじ.png',
        isSecret: true,
        unlockCondition: 'win_murderer_1',
        unlockHint: '殺人犯陣営として1回勝利する'
    },
    {
        id: 'gocho_howling',
        name: '吠える伍長',
        imagePath: '/assets/avatars/吠える伍長.png',
        isSecret: true,
        unlockCondition: 'prevent_hack_3',
        unlockHint: '1ゲーム中にハッカーの攻撃を3回防ぐ'
    },
    {
        id: 'maou',
        name: '魔王',
        imagePath: '/assets/avatars/魔王.png',
        isSecret: true,
        unlockCondition: 'perfect_win_murderer',
        unlockHint: '殺人犯として誰にも疑われずに完全勝利する'
    },
    {
        id: 'gocho_sulking',
        name: '拗ね伍長',
        imagePath: '/assets/avatars/拗ね伍長.png',
        isSecret: true,
        unlockCondition: 'first_death',
        unlockHint: '最初のターンで死亡する'
    },
    {
        id: 'spike_law',
        name: 'スパイク・ロー',
        imagePath: '/assets/avatars/スパイク・ロー.png',
        isSecret: true,
        unlockCondition: 'win_hacker_3',
        unlockHint: 'ハッカー陣営として累計3回勝利する'
    },
    {
        id: 'chibigirl_real',
        name: 'チビガール',
        imagePath: '/assets/avatars/チビガール.png',
        isSecret: true,
        unlockCondition: 'win_employee_5',
        unlockHint: '社員陣営として累計5回勝利する'
    },
    {
        id: 'wraith_hunter',
        name: 'レイス・ハンター',
        imagePath: '/assets/avatars/レイス・ハンター.png',
        isSecret: true,
        unlockCondition: 'win_murderer_3',
        unlockHint: '殺人犯陣営として累計3回勝利する'
    },
];

/**
 * skinIdに対応する画像パスを返す。見つからない場合はデフォルトを返す。
 */
export function getSkinImagePath(skinId?: string): string {
    const skin = AVAILABLE_SKINS.find(s => s.id === skinId);
    return skin ? skin.imagePath : AVAILABLE_SKINS[0].imagePath;
}
