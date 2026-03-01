// ============================================================
// 型定義 — server.ts から抽出
// ============================================================

/** ターンのフェーズ */
export type TurnPhase = 'discussion' | 'action' | 'resolve' | 'final_voting';

/** 詠唱待機中の保留アクション */
export interface PendingAction {
  playerId: string;
  playerName: string;
  socketId: string;
  actionType: string;
  targetId?: string;
  cost: number;
  isHackerAction: boolean;
  publicCost: number;
  timerId: ReturnType<typeof setTimeout>;
}

/** プレイヤー情報 */
export interface Player {
  id: string;
  name: string;
  role: string;
  isHacker: boolean;
  isMurderer: boolean;           // 殺人犯フラグ
  secret?: string;               // キャラクター固有の秘密
  isIsolated: boolean;           // 投票によるAPデバフ中か
  votes: number;                 // 獲得票数
  performedHackerAction: boolean; // 現在のターンにハッカー行動をしたか
  lastTurnHackerAction: boolean;  // 昨ターンのハッカー行動（TRACE_LOG用）
  apDebuff: number;              // 次ターンのAPデバフ（DDOS・投票用）
  chargedAp: number;             // チャージAP（殺人犯・ハッカー専用、最大3）
  apSpentThisTurn: number;       // 現在のターンに消費したAP合計
  // バフ・デバフ状態
  isIpBlocked: boolean;          // IP_BLOCKを受けているか
  isIpBlockedNextTurn: boolean;  // 次ターンIP_BLOCK予約
  isPatched: boolean;            // PATCHを受けているか（デバフ無効）
  pipelineActive: boolean;       // PIPELINE効果中
  pipelinePartnerId: string | null; // PIPELINE接続相手のID
  analyzedThisTurn: boolean;     // このターンに証拠解析を実行したか
  isFalseFlagged: boolean;       // FALSE_FLAGで偽装されているか（ターン限定）
  // 新スキル用フィールド
  transferUsedThisTurn: boolean;   // リソース譲渡使用済みフラグ
  transferBonusNextTurn: number;   // リソース譲渡による次ターンAPボーナス
  malwareUsedThisTurn: number;     // マルウェア使用回数
  exfilUsedThisTurn: number;       // EXFIL使用回数
  copiedSkill: string | null;      // インフラリーダーがコピーしたスキル
  copiedSkillLabel: string | null; // UI表示用のスキル名
  deployBotUsedThisTurn: number;   // 解析BOT配置使用回数（犯人×DevOps用）
  nullifyUsedThisTurn: boolean;    // 無効化使用済みフラグ（Murderer用）
  sessionToken: string;            // 再接続認証用トークン
  skinId: string;                  // アバタースキンID
}

/** ゲーム全体の状態 */
export interface GameState {
  hp: number;
  maxHp: number;                    // HP上限 (通常100, SpecUp時120)
  leak: number;
  evidenceAnalysisProgress: number; // 証拠解析率
  turn: number;
  timeLeft: number;
  phase: TurnPhase;
  isPaused: boolean;
  logs: { id: string; time: string; level: string; content: string }[];
  players: Player[];
  totalPublicAp: number;           // 公開ログ上のAP合計
  totalActualAp: number;           // 実際のAP消費合計
  devOpsBots: number;              // DevOpsのボット数
  firewallActive: boolean;         // Firewall状態
  votedPlayers: { [voterId: string]: string }; // 投票履歴
  currentTurnAttackActions: number;  // 現在のターンの攻撃的行動数
  currentTurnManipActions: number;   // 現在のターンの工作型行動数
  previousTurnAttackActions: number; // 前のターンの攻撃的行動数
  previousTurnManipActions: number;  // 前のターンの工作型行動数
  isGameStarted: boolean;           // ゲーム開始フラグ
  // スキル用フラグ
  honeyPotActive: boolean;
  honeyPotTarget: string;
  specUpTurnsRemaining: number;
  restoreActive: boolean;
  maskingActive: boolean;
  maskingActiveNextTurn: boolean;
  blackoutActive: boolean;
  // 最終投票フェーズ用
  finalVotesMurderer: { [voterId: string]: string };
  finalVotesHacker: { [voterId: string]: string };
  finalVotingComplete: boolean;
  finalVotingResult: 'none' | 'employee_perfect_win' | 'employee_win' | 'murderer_escape' | 'hacker_win';
  revealedMurdererName: string | null;
  turnDuration: number;
  hasPendingActions: boolean;
}

/** キャラクターごとの秘密情報 */
export const CHARACTER_SECRETS: { [key: string]: string } = {
  'ネットワーク管理者': 'マイニングの証拠',
  'セキュリティ分析官': '偽造文書の件',
  'DBエンジニア': 'データ売却未遂',
  'システムオペレーター': 'ログ改ざんの件',
  'インフラリーダー': '機密持ち出し未遂',
  'DevOps': 'バックドア設置'
};

/** 使用可能な役職一覧 */
export const ROLES = [
  'ネットワーク管理者',
  'セキュリティ分析官',
  'DBエンジニア',
  'システムオペレーター',
  'インフラリーダー',
  'DevOps'
];

/** 新規プレイヤーのデフォルト値 */
export function createDefaultPlayer(id: string, name: string, role: string, sessionToken: string): Player {
  return {
    id,
    name,
    role,
    isHacker: false,
    isMurderer: false,
    isIsolated: false,
    votes: 0,
    performedHackerAction: false,
    lastTurnHackerAction: false,
    apDebuff: 0,
    chargedAp: 0,
    apSpentThisTurn: 0,
    isIpBlocked: false,
    isIpBlockedNextTurn: false,
    isPatched: false,
    pipelineActive: false,
    pipelinePartnerId: null,
    analyzedThisTurn: false,
    isFalseFlagged: false,
    transferUsedThisTurn: false,
    transferBonusNextTurn: 0,
    malwareUsedThisTurn: 0,
    exfilUsedThisTurn: 0,
    copiedSkill: null,
    copiedSkillLabel: null,
    deployBotUsedThisTurn: 0,
    nullifyUsedThisTurn: false,
    sessionToken,
    skinId: 'default_01',
  };
}
