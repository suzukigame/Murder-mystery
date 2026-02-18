import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(cors());

// フロントエンドのビルド成果物のパス (プロジェクト: SKY-MAGYCC JUDAS)
const clientDistPath = path.resolve(__dirname, '../../nexus-war-app/dist');

// フロントエンドのビルド成果物を配信
app.use(express.static(clientDistPath));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 開発中は全許可
        methods: ["GET", "POST"]
    }
});

// CONSTANTS FOR DEVELOPMENT (1 min turns)
const TURN_DURATION = 1 * 60; // 1分 (開発用)
// const TURN_DURATION = 10 * 60; // 10分 (本番用)

// 型定義
type TurnPhase = 'discussion' | 'action' | 'resolve' | 'final_voting';

interface Player {
    id: string;
    name: string;
    role: string;
    isHacker: boolean;
    isMurderer: boolean; // 殺人犯フラグ
    secret?: string;      // キャラクター固有の秘密
    isIsolated: boolean; // 投票によるAPデバフ中か（UI表示用、実質的にはapDebuffで管理）
    votes: number;       // 獲得票数
    performedHackerAction: boolean; // 現在のターンにハッカー行動をしたか
    lastTurnHackerAction: boolean;  // 昨ターンのハッカー行動（TRACE_LOG用）
    apDebuff: number;    // 次ターンのAPデバフ（DDOS・投票用）
    chargedAp: number;   // チャージAP（殺人犯・ハッカー専用、最大3）
    apSpentThisTurn: number; // 現在のターンに消費したAP合計（チャージ計算用）
    // バフ・デバフ状態
    isIpBlocked: boolean;    // IP_BLOCKを受けているか
    isIpBlockedNextTurn: boolean; // 次ターンIP_BLOCK予約
    isPatched: boolean;      // PATCHを受けているか（デバフ無効）
    pipelineActive: boolean; // PIPELINE効果中
    pipelinePartnerId: string | null; // PIPELINE接続相手のID
    analyzedThisTurn: boolean; // このターンに証拠解析を実行したか
    isFalseFlagged: boolean; // FALSE_FLAGで偽装されているか（ターン限定）

    // 新スキル用フィールド
    transferUsedThisTurn: boolean; // リソース譲渡使用済みフラグ
    transferBonusNextTurn: number; // リソース譲渡による次ターンAPボーナス
    malwareUsedThisTurn: number;   // マルウェア使用回数
    copiedSkill: string | null;    // インフラリーダーがコピーしたスキル
    copiedSkillLabel: string | null; // UI表示用のスキル名
    sessionToken: string;         // 再接続認証用トークン
}

interface GameState {
    hp: number;
    maxHp: number; // 新: HP上限 (通常100, SpecUp時120)
    leak: number;
    evidenceAnalysisProgress: number; // 新: 証拠解析率
    turn: number;
    timeLeft: number;
    phase: TurnPhase;
    isPaused: boolean;
    logs: any[];
    players: Player[];
    totalPublicAp: number; // 公開ログ上のAP合計
    totalActualAp: number; // 実際のAP消費合計（不一致が証拠になる）
    devOpsBots: number;    // 新: DevOpsのボット数
    firewallActive: boolean; // 新: Firewall状態 (消費されるまで永続)
    votedPlayers: { [voterId: string]: string }; // 新: 投票履歴
    currentTurnAttackActions: number; // 現在のターンの攻撃的行動数 (Intrusion)
    currentTurnManipActions: number;   // 現在のターンの工作型行動数 (Manipulation)
    previousTurnAttackActions: number; // 前のターンの攻撃的行動数
    previousTurnManipActions: number;  // 前のターンの工作型行動数
    isGameStarted: boolean;            // 新: ゲーム開始フラグ (役割割り当て済みか)
    // 新スキル用フラグ
    honeyPotActive: boolean;    // ハニーポット (DB Engineer)
    honeyPotTarget: string;     // ハニーポットのターゲット（実質不要だが拡張性のため）
    specUpTurnsRemaining: number; // 新: スペックアップ残りターン数
    restoreActive: boolean;     // 新: リストア待機中 (HP<=0で発動)
    maskingActive: boolean;     // マスキング効果中 (LEAK軽減)
    maskingActiveNextTurn: boolean; // マスキング次ターン予約
    blackoutActive: boolean;    // 停電 (Murderer)

    // 最終投票フェーズ用
    finalVotesMurderer: { [voterId: string]: string }; // 殺人犯への投票
    finalVotesHacker: { [voterId: string]: string };   // ハッカーへの投票
    finalVotingComplete: boolean;                       // 最終投票完了フラグ
    finalVotingResult: 'none' | 'employee_perfect_win' | 'employee_win' | 'murderer_escape'; // 最終投票結果
    revealedMurdererName: string | null; // 証拠解析100%で判明した殺人犯の名前
    turnDuration: number;               // 1ターンの基本的な時間 (秒)
}

// ゲーム状態初期化関数
const getInitialState = (): GameState => ({
    hp: 100,
    maxHp: 100,
    leak: 0,
    evidenceAnalysisProgress: 0,
    turn: 1, // 1-8
    timeLeft: TURN_DURATION,
    phase: 'discussion', // discussion, action, resolve
    isPaused: false,
    logs: [] as { id: string, time: string, level: string, content: string }[],
    players: [],
    totalPublicAp: 0,
    totalActualAp: 0,
    devOpsBots: 0,
    firewallActive: false,
    votedPlayers: {},
    currentTurnAttackActions: 0,
    currentTurnManipActions: 0,
    previousTurnAttackActions: 0,
    previousTurnManipActions: 0,
    isGameStarted: false,

    // 新スキル用フラグ初期化
    honeyPotActive: false,
    honeyPotTarget: '',
    specUpTurnsRemaining: 0,
    restoreActive: false,
    maskingActive: false,
    maskingActiveNextTurn: false,
    blackoutActive: false,

    finalVotesMurderer: {},
    finalVotesHacker: {},
    finalVotingComplete: false,
    finalVotingResult: 'none',
    revealedMurdererName: null,
    turnDuration: TURN_DURATION
});

let gameState = getInitialState();

// GM観戦者のSocket IDセット (プレイヤーリストとは別管理)
const spectatorIds = new Set<string>();

// ログ追加関数 (actor: GM観戦者にのみ表示される実行者名)
const addLog = (content: string, level: 'info' | 'warn' | 'critical' | 'system' = 'info', actor?: string) => {
    const log = {
        id: Date.now().toString() + Math.random(),
        time: new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }),
        level,
        content
    };
    gameState.logs.unshift(log);
    if (gameState.logs.length > 100) gameState.logs.pop();
    // プレイヤーには通常のログを送信
    io.emit('log_update', log);
    // GM観戦者にはアクター情報付きのログを送信
    if (actor && spectatorIds.size > 0) {
        const gmLog = { ...log, actor };
        spectatorIds.forEach(sid => {
            io.to(sid).emit('gm_log_update', gmLog);
        });
    }
};

// 1秒ごとのタイマー処理
setInterval(() => {
    // 状態送信は常に継続（ハートビート）
    io.emit('state_update', gameState);

    // GM観戦者に役割情報を送信
    if (spectatorIds.size > 0 && gameState.isGameStarted) {
        const gmInfo = gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            isHacker: p.isHacker,
            isMurderer: p.isMurderer,
            isIsolated: p.isIsolated,
            votes: p.votes
        }));
        spectatorIds.forEach(sid => {
            io.to(sid).emit('gm_info', gmInfo);
        });
    }

    if (gameState.isPaused || gameState.turn > 8 || gameState.phase === 'final_voting' || !gameState.isGameStarted) return;

    gameState.timeLeft--;

    // デバッグログ (5秒ごと)
    if (gameState.timeLeft % 5 === 0) {
        console.log(`[DEBUG] Turn: ${gameState.turn}, Time: ${gameState.timeLeft}, Phase: ${gameState.phase}`);
    }



    // ...

    // フェーズ遷移ロジック
    const elapsed = gameState.turnDuration - gameState.timeLeft;

    // 比率ベースでのフェーズ配分 (Discussion 2/3, Action 1/4, Resolve 残り)
    // 開発用 (1分): Discussion 40秒 -> Action 15秒 -> Resolve 5秒
    const ACTION_START = Math.floor(gameState.turnDuration * (40 / 60));
    const RESOLVE_START = Math.floor(gameState.turnDuration * (55 / 60));

    // 本番用 (10分): Discussion 7分 -> Action 2分 -> Resolve 1分
    // const ACTION_START = 7 * 60;   // 7分経過でアクション開始 (残3分)
    // const RESOLVE_START = 9 * 60;  // 9分経過で解決開始 (残1分)

    if (elapsed < ACTION_START) {
        if (gameState.phase !== 'discussion') {
            gameState.phase = 'discussion';
            io.emit('state_update', gameState);
        }
    } else if (elapsed < RESOLVE_START) {
        if (gameState.phase !== 'action') {
            gameState.phase = 'action';
            addLog('>>> アクションフェーズ開始。コマンドを入力してください。 <<<', 'system');
            io.emit('state_update', gameState);
        }
    } else {
        if (gameState.phase !== 'resolve') {
            gameState.phase = 'resolve';
            addLog('>>> 解決フェーズ。全アクションを処理中... <<<', 'system');


            // 勝利判定チェック
            checkWinCondition();

            io.emit('state_update', gameState);
        }
    }

    // ターン終了
    if (gameState.timeLeft <= 0) {
        // DevOps Botの処理 (ターン終了時)
        if (gameState.devOpsBots > 0) {
            // PIPELINEボーナス判定: CONNECTした両者が共に証拠解析を実行したか
            let pipelineBonus = 0;
            const pipelinePairs = gameState.players.filter(p => p.pipelineActive && p.pipelinePartnerId);
            if (pipelinePairs.length >= 2) {
                // 接続ペアが存在する場合、両方が解析を実行したかチェック
                const devOps = pipelinePairs.find(p => p.pipelinePartnerId !== null);
                if (devOps) {
                    const partner = gameState.players.find(p => p.id === devOps.pipelinePartnerId);
                    if (partner && devOps.analyzedThisTurn && partner.analyzedThisTurn) {
                        pipelineBonus = 2;
                        addLog(`CI/CDパイプラインボーナス発動: ${devOps.name}と${partner.name}の協力解析によりBOT効率が向上しました。(BOT1台あたり +${pipelineBonus}%)`, 'info');
                    }
                }
            }
            const botProgressPerUnit = 3 + pipelineBonus;
            const botProgress = gameState.devOpsBots * botProgressPerUnit;
            gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + botProgress);
            addLog(`自動セキュリティBOTによる解析処理: ${gameState.devOpsBots}台 × ${botProgressPerUnit}% = +${botProgress}%`, 'info');
            checkWinCondition();
        }

        // 投票集計の前に、前ターンの隔離状態を解除
        gameState.players.forEach(p => {
            p.isIsolated = false;
        });

        // 投票集計: 最多得票者に -3 APデバフ
        let maxVotes = 0;
        gameState.players.forEach(p => {
            if (p.votes > maxVotes) {
                maxVotes = p.votes;
            }
        });

        // 最多得票者リストを作成
        const candidates = gameState.players.filter(p => p.votes === maxVotes && maxVotes > 0);

        if (candidates.length === 1) {
            const victim = candidates[0];
            victim.apDebuff += 3; // -3 AP（社員は行動不能、犯人側はチャージがあれば動ける）
            victim.isIsolated = true; // UI表示用フラグ
            addLog(`投票結果: ${victim.name} のネットワーク権限が制限されました (-3 AP)。`, 'warn');
        } else if (candidates.length > 1) {
            addLog(`投票結果: 票数が拮抗しています (${maxVotes}票)。処置は見送られました。`, 'info');
        }

        // AP不一致のログ出力
        const variance = gameState.totalActualAp - gameState.totalPublicAp;
        addLog(`[ターン報告] 公称AP: ${gameState.totalPublicAp} | 実システム負荷: ${gameState.totalActualAp}`, 'system');
        if (variance > 0) {
            addLog(`警告: ${variance} APの異常値を検知。不審なバックグラウンドプロセスを確認。`, 'critical');
        }

        // Turn 8 終了時 → 最終投票フェーズへ
        if (gameState.turn >= 8) {
            gameState.phase = 'final_voting';
            gameState.timeLeft = 0;
            gameState.finalVotesMurderer = {};
            gameState.finalVotesHacker = {};
            gameState.finalVotingComplete = false;
            gameState.finalVotingResult = 'none';
            addLog('>>> 全8ターン終了。最終投票フェーズ: 殺人犯とハッカーを特定せよ。 <<<', 'system');
            io.emit('state_update', gameState);
        } else {
            // 次ターンの準備
            gameState.previousTurnAttackActions = gameState.currentTurnAttackActions;
            gameState.previousTurnManipActions = gameState.currentTurnManipActions;
            gameState.currentTurnAttackActions = 0;
            gameState.currentTurnManipActions = 0;
            gameState.turn++;
            if (gameState.blackoutActive) {
                gameState.timeLeft = Math.floor(gameState.turnDuration / 2);
                gameState.blackoutActive = false; // フラグ消費
                addLog(`停電の影響により、メインコアの電力が制限されています：第 ${gameState.turn} ターンの議論時間が半減しました。`, 'critical');
            } else {
                gameState.timeLeft = gameState.turnDuration;
            }
            gameState.phase = 'discussion';
            gameState.phase = 'discussion';
            gameState.totalPublicAp = 0;
            gameState.totalActualAp = 0;
            // firewallActive はリセットしない（消費されるまで永続）
            gameState.honeyPotActive = false; // HoneyPotリセット

            // SpecUp処理
            if (gameState.specUpTurnsRemaining > 0) {
                gameState.specUpTurnsRemaining--;
                if (gameState.specUpTurnsRemaining === 0) {
                    gameState.maxHp = 100;
                    if (gameState.hp > 100) gameState.hp = 100;
                    addLog(`スペックアップ効果終了: システムリソースが通常状態に戻りました。`, 'system');
                }
            }

            gameState.restoreActive = false;  // Restoreリセット (ターン毎にかけ直しが必要？ ユーザー要件「restore to 20 if hp drops to 0 within the turn」なのでターン終了で切れる)
            // gameState.maskingActive は消費されるまで残すか、ターン制限設けるか。「次ターン」とあるので、このターンに使ったら次のターン終了まで？
            // ユーザー要件「Reduce LEAK progress by 5% once per turn」
            // 実装：MASKINGアクション実行 -> maskingActive=true. 効力は「次ターン」なので、今のターン終わりに消さない。
            // むしろ「次ターン」限定なら、前のターンのmaskingActiveを消す必要がある。
            // シンプルに: MASKINGアクションしたターンには効果なく、次のターン中に1回効果あり。
            // つまりターン終了時には消さないが、再設定が必要？
            // ここでは「消費されるまで残る」だと強すぎるので、「次のターン終了時」に消えるべき。
            // しかしフラグ管理が複雑になるので、一旦「MASKINGされたら次のLEAKまで永続」にするか、「ターン終了時リセット」にするか。
            // 文脈的に「次ターン、〜」なので、ターン終了時にセットされているはず。
            // なのでここではリセットしない。ただし、もし「前のターンにセットして使われなかった」場合どうするか。
            // 一旦そのままで（スタックはしないbooleanなので単純）。

            gameState.blackoutActive = false; // Blackoutリセット
            gameState.votedPlayers = {}; // 投票履歴リセット
            gameState.players.forEach(p => {
                p.votes = 0;
                p.lastTurnHackerAction = p.performedHackerAction; // 現在の行動を前回として保存
                p.performedHackerAction = false; // フラグリセット

                // 新スキル用リセット
                p.transferUsedThisTurn = false;
                p.malwareUsedThisTurn = 0;
                p.copiedSkill = null;
                p.copiedSkillLabel = null;

                // AP処理: チャージ計算 → デバフ適用 → 残りを繰越
                if (p.isHacker || p.isMurderer) {
                    // 1. このターンの実効AP（基本3 + チャージ）から消費分を引く
                    // 修正: transferBonusNextTurn はここでは含めず、チャージ上限適用後に加算する
                    const thisTurnMaxAp = 3 + p.chargedAp;
                    let remaining = Math.max(0, thisTurnMaxAp - p.apSpentThisTurn);

                    // 2. デバフを適用（投票-3AP、DDOS等）
                    // 2. デバフを適用（投票-3AP、DDOS等）
                    // セキュリティパッチ(PATCH)がある場合は無効化
                    if (p.isPatched) {
                        addLog(`防御発動: ${p.name} へのデバフ攻撃がパッチにより無効化されました。`, 'info');
                    } else if (p.apDebuff > 0) {
                        remaining = Math.max(0, remaining - p.apDebuff);
                        addLog(`ネットワーク遅延: ${p.name} のリソースが制限されました (-${p.apDebuff} AP)。`, 'warn');
                    }

                    // 3. 残りAPをチャージとして保存（最大3、次ターンは3+チャージ）
                    // 修正: チャージ上限(3)適用後にボーナス分を加算
                    p.chargedAp = Math.min(3, remaining) + (p.transferBonusNextTurn || 0);

                    if (p.chargedAp > 0) {
                        io.to(p.id).emit('private_message', {
                            senderId: 'SYSTEM',
                            senderName: 'PowerManager',
                            message: `APチャージ: ${p.chargedAp} (次ターンAP: ${3 + p.chargedAp})`
                        });
                    }

                    // クライアントに通知（デバフはサーバー側で消化済み）
                    io.to(p.id).emit('ap_debuff', { amount: 0, chargedAp: p.chargedAp });
                } else {
                    // 社員: デバフ適用 + TRANSFERボーナス反映
                    const employeeCharge = p.transferBonusNextTurn || 0;
                    if (p.isPatched) {
                        addLog(`防御発動: ${p.name} へのデバフ攻撃がパッチにより無効化されました。`, 'info');
                        io.to(p.id).emit('ap_debuff', { amount: 0, chargedAp: employeeCharge });
                    } else if (p.apDebuff > 0) {
                        addLog(`ネットワーク遅延: ${p.name} のリソースが制限されました (-${p.apDebuff} AP)。`, 'warn');
                        io.to(p.id).emit('ap_debuff', { amount: p.apDebuff, chargedAp: employeeCharge });
                    } else {
                        io.to(p.id).emit('ap_debuff', { amount: 0, chargedAp: employeeCharge });
                    }
                    // 社員のchargedApをTRANSFERボーナスに設定（state_updateでクライアントに反映される）
                    p.chargedAp = employeeCharge;
                }
            });
            // ターン終了時にフラグリセット
            gameState.players.forEach(p => {
                p.apSpentThisTurn = 0;
                p.apDebuff = 0;
                // PATCH適用済みプレイヤーへのIP_BLOCK予約を無効化
                if (p.isPatched && p.isIpBlockedNextTurn) {
                    addLog(`防御発動: ${p.name} へのIPブロックがパッチにより無効化されました。`, 'info');
                    p.isIpBlockedNextTurn = false;
                }
                p.isIpBlocked = p.isIpBlockedNextTurn; // 次ターン予約を適用
                p.isIpBlockedNextTurn = false;         // 予約リセット
                p.isPatched = false;    // PATCH解除
                p.pipelineActive = false; // PIPELINE解除
                p.pipelinePartnerId = null; // PIPELINEパートナーリセット
                p.analyzedThisTurn = false; // 解析フラグリセット
                p.isFalseFlagged = false; // 偽装フラグリセット
                p.transferBonusNextTurn = 0; // TRANSFERボーナスリセット
            });

            // Masking更新: 次ターン予約を適用
            gameState.maskingActive = gameState.maskingActiveNextTurn;
            gameState.maskingActiveNextTurn = false;

            addLog(`ターン ${gameState.turn - 1} 終了。ターン ${gameState.turn} を開始します。`, 'system');
            io.emit('state_update', gameState);
        }
    }

}, 1000); // 実時間進行 (デバッグ時はここを変更)

function checkWinCondition() {
    if (gameState.evidenceAnalysisProgress >= 100 && !gameState.revealedMurdererName) {
        const murderer = gameState.players.find(p => p.isMurderer);
        const name = murderer ? murderer.name : "UNKNOWN";
        gameState.revealedMurdererName = name;
        addLog(`!!! 証拠解析コンプリート !!! 殺人犯が判明しました: ${name}`, 'critical');
        // gameState.isPaused = true; // 100%でもゲームは続行（投票で決着）
    }
    if (gameState.leak >= 100) {
        addLog(`!!! データ漏洩 100% !!! ハッカーの勝利。システムは陥落しました。`, 'critical');
        gameState.isPaused = true;
    }
    if (gameState.hp <= 0) {
        addLog(`!!! システムダウン !!! ハッカーの勝利。メインコア破壊。`, 'critical');
        gameState.isPaused = true;
    }
}

// 最終投票集計
function tallyFinalVotes() {
    if (gameState.finalVotingComplete) return;
    gameState.finalVotingComplete = true;

    const realMurderer = gameState.players.find(p => p.isMurderer);
    const realHacker = gameState.players.find(p => p.isHacker);

    // 殺人犯投票の多数決
    const murdererVoteCounts: { [targetId: string]: number } = {};
    Object.values(gameState.finalVotesMurderer).forEach(targetId => {
        murdererVoteCounts[targetId] = (murdererVoteCounts[targetId] || 0) + 1;
    });
    let maxMurdererVotes = 0;
    let murdererGuessId = '';
    Object.entries(murdererVoteCounts).forEach(([id, count]) => {
        if (count > maxMurdererVotes) {
            maxMurdererVotes = count;
            murdererGuessId = id;
        }
    });

    // ハッカー投票の多数決
    const hackerVoteCounts: { [targetId: string]: number } = {};
    Object.values(gameState.finalVotesHacker).forEach(targetId => {
        hackerVoteCounts[targetId] = (hackerVoteCounts[targetId] || 0) + 1;
    });
    let maxHackerVotes = 0;
    let hackerGuessId = '';
    Object.entries(hackerVoteCounts).forEach(([id, count]) => {
        if (count > maxHackerVotes) {
            maxHackerVotes = count;
            hackerGuessId = id;
        }
    });

    const murdererCorrect = realMurderer && murdererGuessId === realMurderer.id;
    const hackerCorrect = realHacker && hackerGuessId === realHacker.id;

    const murdererGuessName = gameState.players.find(p => p.id === murdererGuessId)?.name || 'UNKNOWN';
    const hackerGuessName = gameState.players.find(p => p.id === hackerGuessId)?.name || 'UNKNOWN';

    addLog(`=== 最終投票結果 ===`, 'system');
    addLog(`殺人犯 告発対象: ${murdererGuessName} (${maxMurdererVotes}票) → ${murdererCorrect ? '正解 ✓' : '不正解 ✗'}`, 'system');
    addLog(`ハッカー 告発対象: ${hackerGuessName} (${maxHackerVotes}票) → ${hackerCorrect ? '正解 ✓' : '不正解 ✗'}`, 'system');
    addLog(`真の殺人犯: ${realMurderer?.name || '不明'}`, 'system');
    addLog(`真のハッカー: ${realHacker?.name || '不明'}`, 'system');

    if (murdererCorrect && hackerCorrect) {
        gameState.finalVotingResult = 'employee_perfect_win';
        addLog(`★★★ 完全勝利 ★★★ 裏切り者を全員特定しました！`, 'critical');
    } else if (murdererCorrect) {
        gameState.finalVotingResult = 'employee_win';
        addLog(`★ 社員勝利 ★ 殺人犯を特定！しかしハッカーは逃走...`, 'critical');
    } else {
        gameState.finalVotingResult = 'murderer_escape';
        addLog(`✗ 殺人犯逃亡 ✗ 犯人は闇に消えました...`, 'critical');
    }

    gameState.isPaused = true;
    io.emit('state_update', gameState);
}

io.on('connection', (socket) => {
    console.log('--- NEW CLIENT CONNECTED ---', socket.id);

    // 初期状態送信
    socket.emit('state_update', gameState);
    socket.emit('log_history', gameState.logs);

    // 参加登録
    socket.on('join_game', (data: { name: string, role: string, token?: string }) => {
        // 名前で既存プレイヤーを検索 (再接続対応)
        const existingByName = gameState.players.find(p => p.name === data.name);

        if (existingByName) {
            // トークンが一致する場合のみ再接続を許可
            if (data.token === existingByName.sessionToken) {
                existingByName.id = socket.id;
                addLog(`再接続: ${data.name} 復帰しました。`, 'system');

                // 役割がある場合は個別に再通知
                if (gameState.isGameStarted) {
                    socket.emit('role_assigned', {
                        isHacker: existingByName.isHacker,
                        isMurderer: existingByName.isMurderer,
                        roleName: existingByName.role,
                        secret: existingByName.secret
                    });
                }

                socket.emit('join_success', { name: existingByName.name, token: existingByName.sessionToken });
                io.emit('state_update', gameState);
                return;
            }

            // トークン不一致の場合のみ、使用中として拒否
            socket.emit('error', 'このキャラクターは既に他のプレイヤーが選択しています。以前のセッション情報の復元に失敗しました。');
            return;
        }

        const existingById = gameState.players.find(p => p.id === socket.id);
        if (!existingById) {
            const newToken = Math.random().toString(36).substring(2, 15);
            gameState.players.push({
                id: socket.id,
                name: data.name,
                role: data.role,
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
                copiedSkill: null,
                copiedSkillLabel: null,
                sessionToken: newToken
            });
            addLog(`新規接続: ${data.name} 確立。`, 'system');

            socket.emit('join_success', { name: data.name, token: newToken });

            // 6人揃っていて、かつ未開始なら役割を割り当てる
            if (gameState.players.length === 6 && !gameState.isGameStarted) {
                assignRoles();
            }

            io.emit('state_update', gameState);
        }
    });

    // GM観戦モード入室
    socket.on('join_spectator', () => {
        spectatorIds.add(socket.id);
        console.log('--- NEW GM SPECTATOR CONNECTED ---', socket.id);
        socket.emit('spectator_confirmed');
        // 現在のログ履歴を送信
        socket.emit('log_history', gameState.logs);
        // 役割情報を送信（開始済みなら）
        if (gameState.isGameStarted) {
            const gmInfo = gameState.players.map(p => ({
                id: p.id,
                name: p.name,
                role: p.role,
                isHacker: p.isHacker,
                isMurderer: p.isMurderer,
                isIsolated: p.isIsolated,
                votes: p.votes
            }));
            socket.emit('gm_info', gmInfo);
        }
    });

    // 退室
    socket.on('leave_game', () => {
        // 観戦者の場合
        if (spectatorIds.has(socket.id)) {
            spectatorIds.delete(socket.id);
            addLog('観戦者が退室しました。', 'system');
            return;
        }

        const index = gameState.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            const player = gameState.players[index];
            addLog(`退室: ${player.name} がロビーに戻りました。`, 'system');
            gameState.players.splice(index, 1);

            // 全員退室したらゲーム状態をリセット (再設定可能にするため)
            if (gameState.players.length === 0) {
                gameState.isGameStarted = false;
                gameState.turn = 1;
                gameState.phase = 'discussion';
                gameState.timeLeft = gameState.turnDuration;
                gameState.hp = 100;
                gameState.maxHp = 100;
                gameState.leak = 0;
                gameState.evidenceAnalysisProgress = 0;
                gameState.logs = [];
                gameState.logs.push({
                    id: Date.now().toString(),
                    time: new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }),
                    level: 'system',
                    content: '全プレイヤーが退室しました。ゲーム状態をリセットし、設定変更を受け付けます。'
                });
                spectatorIds.clear(); // 観戦者もクリア
            }

            io.emit('state_update', gameState);
        }
    });

    // 設定変更
    socket.on('update_settings', (data: { turnDuration?: number }) => {
        // ゲーム開始前のみ変更可能
        if (gameState.isGameStarted) return;

        if (data.turnDuration !== undefined) {
            gameState.turnDuration = data.turnDuration;
            gameState.timeLeft = data.turnDuration;
            addLog(`システム設定変更: 1ターンの時間を ${data.turnDuration} 秒に設定しました。`, 'system');
        }
        io.emit('state_update', gameState);
    });

    // キャラクターごとの秘密情報の定義（ベーステキスト：役割通知時に上書きされる）
    const CHARACTER_SECRETS: { [key: string]: string } = {
        'ネットワーク管理者': 'マイニングの証拠',
        'セキュリティ分析官': '偽造文書の件',
        'DBエンジニア': 'データ売却未遂',
        'システムオペレーター': 'ログ改ざんの件',
        'インフラリーダー': '機密持ち出し未遂',
        'DevOps': 'バックドア設置'
    };

    // 役割割り当て関数
    function assignRoles() {
        // すでに開始している場合は重複を防ぐ
        if (gameState.isGameStarted) return;

        const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);

        // ランダムに役職割り当て
        // 0番目: ハッカー
        // 1番目: 殺人犯
        // その他: 社員

        // ランダムに役割 (Role) を割り当て
        const ROLES = ['ネットワーク管理者', 'セキュリティ分析官', 'DBエンジニア', 'システムオペレーター', 'インフラリーダー', 'DevOps'];
        const shuffledRoles = [...ROLES].sort(() => Math.random() - 0.5);

        gameState.players.forEach((p, index) => {
            p.role = shuffledRoles[index]; // ランダム役割を適用
            p.isHacker = false;
            p.isMurderer = false;
            p.secret = ""; // 社員には個別の秘密（過去の不正など）を表示しない
        });

        // ハッカー割り当て
        const hacker = gameState.players.find(p => p.id === shuffled[0].id);
        if (hacker) {
            hacker.isHacker = true;
            // ハッカーの秘密を上書き
            hacker.secret = "あなたはハッカーとしてシステムに潜入した。鈴木の死は好機だ。";
        }

        // 殺人犯割り当て
        const murderer = gameState.players.find(p => p.id === shuffled[1].id);
        if (murderer) {
            murderer.isMurderer = true;
            // 殺人犯の秘密を上書き（犯行と動機を追加）
            murderer.secret = "あなたは18:00に鈴木を殺害した。明日の朝、鈴木に不正を公表される予定だったからだ。証拠ファイルを解析されると終わりだ。";
        }

        gameState.isGameStarted = true; // 開始フラグを立てる

        gameState.players.forEach(p => {
            p.votes = 0;
            p.isIsolated = false;
            p.chargedAp = 0;        // ゲーム開始時リセット
            p.apSpentThisTurn = 0;  // ゲーム開始時リセット
            p.apDebuff = 0;         // ゲーム開始時リセット
            p.isIpBlocked = false;
            p.isIpBlockedNextTurn = false;
            p.performedHackerAction = false;
            p.lastTurnHackerAction = false;

            // 各プレイヤーに自分の役割と秘密を個別に通知
            let roleMsg = "社員";
            if (p.isHacker) roleMsg = "ハッカー";
            if (p.isMurderer) roleMsg = "殺人犯";

            io.to(p.id).emit('role_assigned', {
                isHacker: p.isHacker,
                isMurderer: p.isMurderer,
                roleName: p.role,
                secret: p.secret
            });
        });

        addLog('役職割当完了。殺人犯1名、ハッカー1名が潜伏中。真実を暴け。', 'system');
    }
    socket.on('action', (data: { type: string, cost: number, targetId?: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player) return;

        // アクション実行: AP消費を累積（チャージ計算用）
        player.apSpentThisTurn += data.cost;

        const isHackerAction = ['INJECT_MALWARE', 'EXFILTRATE', 'EXFIL', 'TAMPER_EVIDENCE', 'DDOS', 'FALSE_FLAG', 'SABOTAGE', 'LOCKOUT', 'BLACKOUT', 'PHYSICAL_DESTROY'].includes(data.type);
        const isMurdererAction = ['TAMPER_EVIDENCE', 'SABOTAGE', 'LOCKOUT', 'FALSE_FLAG', 'BLACKOUT', 'PHYSICAL_DESTROY'].includes(data.type);
        const publicCost = isHackerAction ? 0 : data.cost; // ハッカー/マーダーアクションは表向き0APに見える

        gameState.totalPublicAp += publicCost;
        gameState.totalActualAp += data.cost;

        if (isHackerAction) {
            player.performedHackerAction = true;
        }

        const executorName = player.name;

        // コピーしたスキルの使用判定
        const isUsingCopiedSkill = player.copiedSkill === data.type;

        if (isHackerAction && !player.isHacker && !(isMurdererAction && player.isMurderer) && !isUsingCopiedSkill) {
            socket.emit('error', '不正アクセス: ROOT権限が必要です。');
            return;
        }

        // コピーしたスキルを消費する（処理の最後で行うためにフラグを使用）
        if (isUsingCopiedSkill) {
            player.copiedSkill = null;
            player.copiedSkillLabel = null;
        }

        // 行動阻害チェック (IP_BLOCK)
        if (player.isIpBlocked) {
            socket.emit('error', '通信遮断: IPブロックによりアクションが拒否されました。');
            addLog(`アクション失敗: ${player.name} は通信遮断されています。`, 'warn');
            return;
        }



        // 基本アクション
        if (data.type === 'INJECT_MALWARE' || data.type === 'INJECT') {
            // ハッカーの使用回数制限 (2回まで)
            if (player.malwareUsedThisTurn >= 2) {
                socket.emit('error', 'リミット到達: マルウェアは1ターンに2回までです。');
                player.apSpentThisTurn -= data.cost; // コスト返却
                return;
            }
            player.malwareUsedThisTurn++;

            gameState.currentTurnAttackActions++;
            if (gameState.firewallActive) {
                addLog(`マルウェア検知。ファイアウォールによりブロックされました。`, 'info', executorName);
                gameState.firewallActive = false; // 消費
            } else {
                // SpecUp効果: ダメージには影響しない（HP上限が増えるだけ）
                let damage = 40;

                gameState.hp = Math.max(0, gameState.hp - damage);
                addLog(`緊急警報: マルウェア検知。送信元: [暗号化済]。システムHP低下 (-${damage})。`, 'critical', executorName);

                // リストア(FORCE_REBOOT改めRESTORE)の発動判定
                if (gameState.hp <= 0 && gameState.restoreActive) {
                    gameState.hp = 20;
                    gameState.restoreActive = false; // 消費
                    addLog(`システム・リストア発動: 致命的なエラーから復旧しました。(HP 0 -> 20)`, 'system');
                }

                // 勝利判定はcheckWinConditionで
            }
        }
        // 1APスキル群
        else if (data.type === 'TRACE_LOG') { // NW Admin 1AP
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                const result = (target.performedHackerAction || target.isFalseFlagged) ? 'Positive (黒)' : 'Negative (白)';
                io.to(player.id).emit('private_message', {
                    senderId: 'SYSTEM',
                    senderName: 'TraceLog',
                    message: `調査結果 [${target.name}]: ${result}`
                });
                addLog(`ログ追跡: ${player.name} が ${target.name} のログを解析しました。`, 'info');
            }
        }
        else if (data.type === 'PATCH') { // Sec Analyst 1AP
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                target.isPatched = true;
                addLog(`セキュリティパッチ: ${player.name} が ${target.name} に防御パッチを適用しました。`, 'info');
            }
        }
        else if (data.type === 'MASKING') { // DB Eng 1AP
            gameState.maskingActiveNextTurn = true;
            addLog(`データマスキング: ${player.name} がデータの隠蔽プロトコルを起動しました。(次回のLEAK軽減)`, 'info');
        }
        else if (data.type === 'TRANSFER') { // Sys Op 1AP
            if (player.transferUsedThisTurn) {
                socket.emit('error', 'クールダウン中: リソース譲渡は1ターンに1回のみです。');
                player.apSpentThisTurn -= data.cost;
                gameState.totalPublicAp -= data.cost; // 公開APもリファンド
                gameState.totalActualAp -= data.cost; // 実APもリファンド
                return;
            }

            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                player.transferUsedThisTurn = true;
                // ターゲットの次ターンAPを+1する（次ターン予約）
                target.transferBonusNextTurn = (target.transferBonusNextTurn || 0) + 1;
                addLog(`リソース・デプロイメント: ${player.name} が ${target.name} にAPリソースを提供しました。(次ターンAP +1)`, 'info');
                // ターゲットに通知
                io.to(target.id).emit('private_message', {
                    senderId: 'SYSTEM',
                    senderName: 'ResourceManager',
                    message: `${player.name} からAPリソースを受け取りました。次ターンAP +1。`
                });
            }
        }
        else if (data.type === 'SKILL_COPY') { // Infra 1AP (旧 LOAD_BALANCER)
            // 自分以外の全プレイヤーからランダムに1APスキルをコピー
            const otherPlayers = gameState.players.filter(p => p.id !== player.id);
            if (otherPlayers.length > 0) {
                const randomTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];

                // ターゲットのロールに基づく1APスキルマップ
                const ROLE_SKILL_MAP: { [key: string]: { type: string, label: string } } = {
                    'ネットワーク管理者': { type: 'TRACE_LOG', label: 'ログ追跡' },
                    'セキュリティ分析官': { type: 'PATCH', label: 'パッチ適用' },
                    'DBエンジニア': { type: 'MASKING', label: 'マスキング' },
                    'システムオペレーター': { type: 'TRANSFER', label: 'リソース・デプロイメント' },
                    'DevOps': { type: 'PIPELINE', label: 'CI/CDパイプライン' },
                    'インフラリーダー': { type: 'DEBUG', label: 'デバッグ' } // 万が一
                };

                // ハッカー・殺人犯であっても、表向きのロール（Role）のスキルをコピーする
                // （正体隠匿のため、またユーザー要望により「アサインされたロール」のスキルを使用可能にする）
                let skillInfo = ROLE_SKILL_MAP[randomTarget.role];

                if (skillInfo) {
                    player.copiedSkill = skillInfo.type;
                    player.copiedSkillLabel = skillInfo.label;

                    io.to(player.id).emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'SkillCopier',
                        message: `機能取得成功: [${skillInfo.label}] をレプリケートしました。このターン中使用可能です。`
                    });
                    addLog(`レプリケーション: ${player.name} が他者の機能を一時的に複製しました。`, 'info');
                }
            }
        }
        else if (data.type === 'DEBUG') { // DevOps 1AP
            player.apSpentThisTurn = Math.max(0, player.apSpentThisTurn - 1); // 消費0にする＝自分が実質+1
            addLog(`デバッグ作業: ${player.name} がリソースを最適化しました。`, 'info');
        }
        else if (data.type === 'PIPELINE') { // DevOps 1AP (New)
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                player.pipelineActive = true;
                player.pipelinePartnerId = target.id;
                target.pipelineActive = true;
                target.pipelinePartnerId = player.id;
                addLog(`CI/CDパイプライン構築: ${player.name} と ${target.name} を接続しました。両者が証拠解析を実行するとBOT効率UP！`, 'info');
            }
        }

        // 2APスキル群 (必殺技)
        else if (data.type === 'IP_BLOCK') { // NW Admin 2AP
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                target.isIpBlockedNextTurn = true; // 次ターン有効
                addLog(`通信遮断(IP BLOCK): ${player.name} が ${target.name} の接続を強制切断しました。(次ターン適用)`, 'warn');
            }
        }
        else if (data.type === 'FIREWALL') { // Sec Analyst 2AP
            gameState.firewallActive = true;
            addLog(`ファイアウォール展開: システム防御壁が有効化されました。(次の攻撃1回をブロック)`, 'info');
        }
        else if (data.type === 'HONEY_POT') { // DB Eng 2AP
            gameState.honeyPotActive = true;
            addLog(`ハニーポット設置: 誘引トラップが仕掛けられました。`, 'info');
        }
        else if (data.type === 'RESTORE') { // Sys Op 2AP (旧 FORCE_REBOOT)
            // HPが0になったときに20回復する予約
            gameState.restoreActive = true;
            addLog(`システム・リストア準備: 緊急復旧プロトコルがセットされました。(HP0時に自動発動)`, 'info');
        }
        else if (data.type === 'SPEC_UP') { // Infra 2AP (旧 SERVER_OVERCLOCK)
            gameState.maxHp = 120;
            gameState.specUpTurnsRemaining = 2; // このターンと次ターン
            addLog(`スペックアップ: サーバーリソース増強。HP上限が120に拡張されました。(2ターン持続)`, 'info');
        }
        else if (data.type === 'DEPLOY_BOT') { // DevOps 2AP
            gameState.devOpsBots = Math.min(3, gameState.devOpsBots + 1);
            addLog(`解析ボット配備: 現在稼働数 ${gameState.devOpsBots}台。`, 'info');
        }

        // 既存アクションの修正
        else if (data.type === 'RESTORE_SYSTEM') {
            gameState.hp = Math.min(gameState.maxHp, gameState.hp + 10);
            addLog(`システムパッチ適用。HP回復。`, 'info', executorName);
        } else if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') {
            gameState.currentTurnAttackActions++;
            if (gameState.firewallActive) {
                addLog(`データ持ち出し阻止。ファイアウォール作動。`, 'info', executorName);
                gameState.firewallActive = false;
            } else {
                let leakAmount = 15;
                // Masking効果
                if (gameState.maskingActive) {
                    leakAmount -= 5;
                    gameState.maskingActive = false; // 消費
                    addLog(`マスキング効果発動: データ漏洩が軽減されました (-5%)。`, 'system');
                }

                gameState.leak = Math.min(100, gameState.leak + leakAmount);
                addLog(`データ持ち出し検知。送信元: [不明]。`, 'critical', executorName);

                // HoneyPot発動判定
                if (gameState.honeyPotActive) {
                    const dbEngineer = gameState.players.find(p => p.role === 'DBエンジニア');
                    if (dbEngineer) {
                        io.to(dbEngineer.id).emit('private_message', {
                            senderId: 'SYSTEM',
                            senderName: 'HoneyPot',
                            message: `[ハニーポット作動] データ持ち出し実行者を特定: ${executorName}`
                        });
                    }
                    gameState.honeyPotActive = false; // 消費
                }
            }
        } else if (data.type === 'ANALYZE_EVIDENCE') {
            // 証拠解析
            player.analyzedThisTurn = true; // PIPELINEボーナス判定用フラグ
            if (!player.isMurderer) {
                const amount = 10;
                gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + amount);
            }
            addLog(`証拠解析完了。`, 'info', executorName);
            checkWinCondition();
        } else if (data.type === 'ENCRYPT_DATA') {
            gameState.leak = Math.max(0, gameState.leak - 10);
            addLog(`データ暗号化完了。漏洩リスク低減。`, 'info', executorName);
        } else if (data.type === 'VIEW_AUDIT_LOG') {
            const total = gameState.previousTurnAttackActions + gameState.previousTurnManipActions;
            // 実行者にのみ詳細を通知
            io.to(socket.id).emit('private_message', {
                senderId: 'SYSTEM',
                senderName: 'AuditScanner',
                message: `[監査報告] 前サイクルにおける不正タスク: ${total}件 (侵入: ${gameState.previousTurnAttackActions}, 改ざん: ${gameState.previousTurnManipActions})`
            });
            // 実行された事実のみ公表
            addLog(`${executorName} がシステム監査を実行。結果はエージェントにのみ通知されました。`, 'info', executorName);
        } else if (data.type === 'COVER_TRACKS') {
            gameState.currentTurnManipActions++;
            player.performedHackerAction = false;
            player.lastTurnHackerAction = false;
            // ハッカー本人にだけ通知
            io.to(player.id).emit('private_message', {
                senderId: 'SYSTEM',
                senderName: 'HackerOS',
                message: `痕跡消去完了。ログ追跡の結果がNEGATIVEにリセットされました。`
            });
        } else if (data.type === 'DDOS') {
            gameState.currentTurnAttackActions++;
            // ハッカースキル: DDOS攻撃（ターゲットの次ターンAPを-1）
            if (player.isHacker) {
                const target = gameState.players.find(p => p.id === data.targetId);
                if (target) {
                    target.apDebuff = 2; // -2AP
                    addLog(`警告: ネットワーク上の異常なリソース消費を検知。`, 'critical', executorName);
                    // ターゲットには個人通知
                    io.to(target.id).emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'SystemAlert',
                        message: `あなたの端末がDDOS攻撃を受けました。次ターンのAP -2。`
                    });
                }
            } else {
                socket.emit('error', '不正アクセス: ROOT権限が必要です。');
            }
        } else if (data.type === 'FALSE_FLAG') {
            gameState.currentTurnManipActions++;
            // ハッカースキル: 証拠偽装（ターゲットのTRACE_LOG結果をPOSITIVEに偽装）
            if (player.isHacker || player.isMurderer) {
                const target = gameState.players.find(p => p.id === data.targetId);
                if (target) {
                    target.isFalseFlagged = true; // ターン限定の偽装フラグ
                    // 実行者にだけ通知
                    io.to(player.id).emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'HackerOS',
                        message: `${target.name} に偽装工作を実行。ログ追跡の結果はPOSITIVEとなります。`
                    });
                }
            } else {
                socket.emit('error', '不正なアクションです。');
            }
        } else if (data.type === 'TAMPER_EVIDENCE') {
            gameState.currentTurnManipActions++;
            // 殺人犯スキル: 証拠改ざん
            if (player.isMurderer) {
                // 解析を後退させる
                gameState.evidenceAnalysisProgress = Math.max(0, gameState.evidenceAnalysisProgress - 5); // バランス調整: 15 -> 5
                addLog(`警告: 証拠ログのデータ破損を検知。`, 'critical', executorName);
                // 殺人犯も痕跡を残す（TRACE_LOGでバレるようにする）
                player.performedHackerAction = true;
            } else {
                socket.emit('error', '不正なアクションです。');
            }
        } else if (data.type === 'SABOTAGE') {
            gameState.currentTurnManipActions++;
            // 殺人犯スキル: サボタージュ (HP -5)
            if (player.isMurderer) {
                if (gameState.firewallActive) {
                    addLog(`サボタージュ試行を検知。ファイアウォールによりブロックされました。`, 'info', executorName);
                    gameState.firewallActive = false; // 消費
                } else {
                    gameState.hp = Math.max(0, gameState.hp - 5);
                    addLog(`システムグリッチ検知。内部サボタージュの疑いあり。`, 'warn', executorName);
                }
                player.performedHackerAction = true; // 痕跡残る
            } else {
                socket.emit('error', '不正なアクションです。');
            }
        } else if (data.type === 'LOCKOUT') {
            gameState.currentTurnManipActions++;
            // 殺人犯スキル: 市民を行動不能にする (Next Turn AP = 0)
            if (player.isMurderer) {
                if (gameState.firewallActive) {
                    addLog(`ロックアウト試行を検知。ファイアウォールによりブロックされました。`, 'info', executorName);
                    gameState.firewallActive = false; // 消費
                } else {
                    const target = gameState.players.find(p => p.id === data.targetId);
                    if (target) {
                        target.apDebuff = 3; // APを0にする (3 - 3 = 0)
                        addLog(`端末に対するセキュリティロックアウトを開始。`, 'critical', executorName);
                        // ターゲットには個人通知
                        io.to(target.id).emit('private_message', {
                            senderId: 'SYSTEM',
                            senderName: 'AdminAuth',
                            message: `あなたの端末はロックアウトされました。次ターンのAP -3。`
                        });
                        player.performedHackerAction = true; // 痕跡残る
                    }
                }
            } else {
                socket.emit('error', '不正なアクションです。');
            }
        } else if (data.type === 'BLACKOUT') {
            gameState.currentTurnManipActions++;
            if (player.isMurderer || player.isHacker) {
                gameState.blackoutActive = true;
                addLog(`警告: 電力供給システムの異常を検知。停電の恐れあり。`, 'critical', executorName);
            }
        }
        else if (data.type === 'PHYSICAL_DESTROY') {
            gameState.currentTurnManipActions++;
            if (player.isMurderer || player.isHacker) {
                if (gameState.devOpsBots > 0) {
                    gameState.devOpsBots--;
                    addLog(`警告: サーバー室で火災発生。解析ノードが破壊されました。`, 'critical', executorName);
                } else {
                    addLog(`ノード・デストラクションを実行したが、対象が存在しませんでした。`, 'warn', executorName);
                }
                player.performedHackerAction = true; // 痕跡残る
            }
        }


        io.emit('state_update', gameState);
    });

    // チャット受信
    socket.on('chat_message', (data: { targetId: string, message: string, senderName: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const name = player ? player.name : data.senderName;

        // 全員へのログは匿名化
        addLog('ENCRYPTED COMMUNICATION DETECTED.', 'warn', name);

        // ターゲットにのみメッセージを送信
        io.to(data.targetId).emit('private_message', {
            senderId: socket.id,
            senderName: name,
            message: data.message
        });
    });

    socket.on('disconnect', () => {
        // 観戦者の切断処理
        if (spectatorIds.has(socket.id)) {
            spectatorIds.delete(socket.id);
            console.log('Spectator disconnected:', socket.id);
            return;
        }
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = gameState.players[playerIndex];
            // サーバー負荷軽減のためリストからは削除せず、切断ログのみ出力（再接続を待つ）
            addLog(`CONNECTION SUSPENDED: ${player.name} (Wait for re-auth)`, 'warn');
            io.emit('state_update', gameState);
        }
        console.log('Client disconnected:', socket.id);
    });

    // ゲームリセット要求
    socket.on('reset_game', () => {
        const currentPlayers = gameState.players;
        const currentDuration = gameState.turnDuration;
        gameState = getInitialState();
        gameState.players = currentPlayers; // プレイヤーリストは維持
        gameState.turnDuration = currentDuration;
        gameState.timeLeft = currentDuration;
        addLog('SYSTEM REBOOT INITIATED... NEW SESSION STARTED.', 'system');

        // 6人揃っていれば自動で役割を振り直して開始
        if (gameState.players.length === 6) {
            assignRoles();
        }

        io.emit('state_update', gameState);
        io.emit('log_history', []);
    });

    // プレイヤーリストの完全リセット (デバッグ/ルーム整理用)
    socket.on('clear_players', () => {
        gameState.players = [];
        gameState.isGameStarted = false;
        addLog('PLAYER LIST CLEARED BY OPERATOR.', 'system');
        io.emit('state_update', gameState);
    });

    // 投票受付
    socket.on('vote', (data: { targetId: string }) => {
        const voter = gameState.players.find(p => p.id === socket.id);
        const target = gameState.players.find(p => p.id === data.targetId);

        if (voter && target && gameState.isGameStarted) {
            // 以前の投票があれば取り消す
            const previousTargetId = gameState.votedPlayers[socket.id];
            if (previousTargetId) {
                const prevTarget = gameState.players.find(p => p.id === previousTargetId);
                if (prevTarget) prevTarget.votes = Math.max(0, prevTarget.votes - 1);
            }

            // 新しい投票
            gameState.votedPlayers[socket.id] = data.targetId;
            target.votes++;

            addLog('ANONYMOUS VOTE RECORDED.', 'system');
            io.emit('state_update', gameState);
        }
    });

    // 最終投票受付 (Turn 8終了後)
    socket.on('final_vote', (data: { murdererVote: string, hackerVote: string }) => {
        if (gameState.phase !== 'final_voting') return;
        const voter = gameState.players.find(p => p.id === socket.id);
        if (!voter) return;

        gameState.finalVotesMurderer[socket.id] = data.murdererVote;
        gameState.finalVotesHacker[socket.id] = data.hackerVote;
        addLog(`${voter.name} HAS SUBMITTED FINAL IDENTIFICATION.`, 'system');
        io.emit('state_update', gameState);

        // 全プレイヤーが投票完了したら自動集計
        const totalVoters = gameState.players.length;
        const votedCount = Object.keys(gameState.finalVotesMurderer).length;
        if (votedCount >= totalVoters) {
            tallyFinalVotes();
        }
    });

    // 最終投票の集計 (GM手動トリガー or 自動)
    socket.on('tally_final_votes', () => {
        if (gameState.phase !== 'final_voting') return;
        tallyFinalVotes();
    });

    // 強制ゲーム開始 (デバッグ用)
    socket.on('start_game_force', () => {
        if (gameState.players.length > 0) {
            assignRoles();
            addLog('SYSTEM OVERRIDE: GAME STARTED BY OPERATOR.', 'system');
            io.emit('state_update', gameState);
        }
    });
});
// 全てのリクエストをフロントエンドにリダイレクト (SPA対応)
app.use((req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
