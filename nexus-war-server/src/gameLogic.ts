// ============================================================
// ゲームロジック — server.ts から抽出
// 各関数は gameState / pendingActions / io をパラメータで受け取り、
// グローバル変数に依存しない純粋な構造。
// ============================================================

import { Server } from 'socket.io';
import {
    GameState,
    PendingAction,
    Player,
    ROLES,
    TurnPhase,
} from './types';

// ----------------------------------------------------------
// 定数
// ----------------------------------------------------------
const DEFAULT_TURN_DURATION = 1 * 60; // 1分 (開発用)
const CHANT_DURATION = 10000;          // 詠唱（待機）時間: 10秒

export { CHANT_DURATION };

// ----------------------------------------------------------
// ゲーム状態初期化
// ----------------------------------------------------------

/**
 * 新しいゲーム状態を生成する
 */
export function getInitialState(turnDuration: number = DEFAULT_TURN_DURATION): GameState {
    return {
        hp: 100,
        maxHp: 100,
        leak: 0,
        evidenceAnalysisProgress: 0,
        turn: 1,
        timeLeft: turnDuration,
        phase: 'discussion',
        isPaused: false,
        logs: [],
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
        turnDuration,
        hasPendingActions: false,
    };
}

// ----------------------------------------------------------
// ログ追加
// ----------------------------------------------------------

/**
 * ゲーム状態にログを追加し、クライアントに配信する。
 * @param io        Socket.io サーバーインスタンス
 * @param gameState ゲーム状態
 * @param content   ログ内容
 * @param level     ログレベル
 * @param actor     GM観戦者にのみ表示される実行者名
 * @param spectatorIds GM観戦者のSocket IDセット
 * @param roomId    ルームID（指定時は io.to(roomId).emit を使用）
 */
export function addLog(
    io: Server,
    gameState: GameState,
    content: string,
    level: 'info' | 'warn' | 'critical' | 'system' = 'info',
    actor?: string,
    spectatorIds?: Set<string>,
    roomId?: string,
): void {
    const log = {
        id: Date.now().toString() + Math.random(),
        time: new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }),
        level,
        content,
    };
    gameState.logs.unshift(log);
    if (gameState.logs.length > 100) gameState.logs.pop();

    // プレイヤーにログを配信
    const target = roomId ? io.to(roomId) : io;
    target.emit('log_update', log);

    // GM観戦者にアクター情報付きログを送信
    if (actor && spectatorIds && spectatorIds.size > 0) {
        const gmLog = { ...log, actor };
        spectatorIds.forEach(sid => {
            io.to(sid).emit('gm_log_update', gmLog);
        });
    }
}

// ----------------------------------------------------------
// 実績・結果送信ヘルパー
// ----------------------------------------------------------

/**
 * ゲーム終了時に全プレイヤーの勝敗・実績用データをクライアントに送信する
 */
function emitGameEndStats(
    io: Server,
    gameState: GameState,
    result: string,
    roomId?: string
) {
    const playerStats = gameState.players.map(p => {
        let faction: 'employee' | 'hacker' | 'murderer' = 'employee';
        if (p.isHacker) faction = 'hacker';
        if (p.isMurderer) faction = 'murderer';

        let won = false;
        if (faction === 'employee' && (result === 'employee_perfect_win' || result === 'employee_win')) won = true;

        // ハッカーは殺人犯が逃げた場合も、社員が殺人犯だけ当てた場合も勝ち
        // さらにシステムダウン（HP0）やデータ漏洩（Leak100）によるハッカー勝利も追加
        if (faction === 'hacker' && (result === 'murderer_escape' || result === 'employee_win' || result === 'hacker_win')) won = true;

        // 殺人犯は自分が逃げた場合のみ勝利
        if (faction === 'murderer' && result === 'murderer_escape') won = true;

        // 殺人犯の完全勝利判定：誰にも投票されなかった
        const murdererVoteCount = Object.values(gameState.finalVotesMurderer)
            .filter(targetId => targetId === p.id).length;

        return {
            playerId: p.id,
            faction,
            won,
            role: p.role,
            wasVotedAsMurderer: murdererVoteCount > 0,
            turn: gameState.turn,
        };
    });

    const emitTarget = roomId ? io.to(roomId) : io;
    console.log('[DEBUG] Emitting game_end_stats:', JSON.stringify({ result, playerStats: playerStats.map(s => ({ id: s.playerId, faction: s.faction, won: s.won })) }));
    emitTarget.emit('game_end_stats', {
        result,
        turn: gameState.turn,
        playerStats,
    });
}

// ----------------------------------------------------------
// 勝利判定
// ----------------------------------------------------------

/**
 * 勝利条件をチェックし、条件を満たしていればゲーム状態を更新する
 */
export function checkWinCondition(
    io: Server,
    gameState: GameState,
    spectatorIds?: Set<string>,
    roomId?: string,
): void {
    if (gameState.evidenceAnalysisProgress >= 100 && !gameState.revealedMurdererName) {
        const murderer = gameState.players.find(p => p.isMurderer);
        const name = murderer ? murderer.name : 'UNKNOWN';
        gameState.revealedMurdererName = name;
        addLog(io, gameState, `!!! 証拠解析コンプリート !!! 殺人犯が判明しました: ${name}`, 'critical', undefined, spectatorIds, roomId);
    }

    // すでにリザルトが決まっている場合は処理しない
    if (gameState.finalVotingResult && gameState.finalVotingResult !== 'none') return;

    if (gameState.leak >= 100) {
        gameState.finalVotingResult = 'hacker_win' as any;
        addLog(io, gameState, `!!! データ漏洩 100% !!! ハッカーの勝利。システムは陥落しました。`, 'critical', undefined, spectatorIds, roomId);
        emitGameEndStats(io, gameState, 'hacker_win', roomId);
        gameState.isPaused = true;
    }
    else if (gameState.hp <= 0) {
        gameState.finalVotingResult = 'hacker_win' as any;
        addLog(io, gameState, `!!! システムダウン !!! ハッカーの勝利。メインコア破壊。`, 'critical', undefined, spectatorIds, roomId);
        emitGameEndStats(io, gameState, 'hacker_win', roomId);
        gameState.isPaused = true;
    }
}

// ----------------------------------------------------------
// 保留アクション実行
// ----------------------------------------------------------

/**
 * 保留中のアクションを実際に実行する
 */
export function executePendingAction(
    io: Server,
    gameState: GameState,
    pendingActions: PendingAction[],
    pa: PendingAction,
    spectatorIds?: Set<string>,
    roomId?: string,
): PendingAction[] {
    const player = gameState.players.find(p => p.id === pa.playerId);
    if (!player) return pendingActions;

    const updatedPending = pendingActions.filter(item => item !== pa);
    if (updatedPending.length === 0) {
        gameState.hasPendingActions = false;
    }

    if (player.isIpBlocked) {
        // IPブロックされているのにパケットが来た場合はスルーまたはログのみ。通常はUIで弾かれる。
        addLog(io, gameState, `通信遮断(IP BLOCK)によりアクションが破棄されました。対象: ${player.name}`, 'warn', undefined, spectatorIds, roomId);
        const emitTarget = roomId ? io.to(roomId) : io;
        emitTarget.emit('state_update', gameState);
        return updatedPending;
    }

    const executorName = player.name;
    const socket = io.sockets.sockets.get(pa.socketId);
    const data = { type: pa.actionType, targetId: pa.targetId, cost: pa.cost };

    // --- アクション実行ロジック ---
    if (data.type === 'INJECT_MALWARE' || data.type === 'INJECT') {
        gameState.currentTurnAttackActions++;
        if (gameState.firewallActive) {
            addLog(io, gameState, `マルウェア検知。ファイアウォールによりブロックされました。`, 'info', executorName, spectatorIds, roomId);
            gameState.firewallActive = false;
        } else {
            const damage = 40;
            gameState.hp = Math.max(0, gameState.hp - damage);
            addLog(io, gameState, `緊急警報: マルウェア検知。送信元: [暗号化済]。システムHP低下 (-${damage})。`, 'critical', executorName, spectatorIds, roomId);
        }
        player.performedHackerAction = true;
    }
    else if (data.type === 'TRACE_LOG') {
        const target = gameState.players.find(p => p.id === data.targetId);
        if (target) {
            const result = (target.performedHackerAction || target.isFalseFlagged) ? 'Positive (黒)' : 'Negative (白)';
            io.to(player.id).emit('private_message', {
                senderId: 'SYSTEM',
                senderName: 'TraceLog',
                message: `調査結果 [${target.name}]: ${result}`,
            });
        }
    }
    else if (data.type === 'PATCH') {
        const target = gameState.players.find(p => p.id === data.targetId);
        if (target) {
            target.isPatched = true;
            addLog(io, gameState, `セキュリティパッチが適用されました。`, 'info', executorName, spectatorIds, roomId);
        }
    }
    else if (data.type === 'MASKING') {
        gameState.maskingActive = true;
        addLog(io, gameState, `データマスキング: データの隠蔽プロトコルが起動されました。(次回のLEAK発生時に軽減)`, 'info', executorName, spectatorIds, roomId);
    }
    else if (data.type === 'TRANSFER') {
        const target = gameState.players.find(p => p.id === data.targetId);
        if (target) {
            target.transferBonusNextTurn = (target.transferBonusNextTurn || 0) + 1;
            addLog(io, gameState, `リソース・デプロイメント: APリソースが提供されました。(次ターンAP +1)`, 'info', executorName, spectatorIds, roomId);
            io.to(target.id).emit('private_message', {
                senderId: 'SYSTEM',
                senderName: 'ResourceManager',
                message: `${player.name} からAPリソースを受け取りました。次ターンAP +1。`,
            });
        }
    }
    else if (data.type === 'SKILL_COPY') {
        const otherPlayers = gameState.players.filter(p => p.id !== player.id);
        const skillPool: { skill: string; label: string }[] = [];
        otherPlayers.forEach(p => {
            if (p.role === 'ネットワーク管理者') skillPool.push({ skill: 'TRACE_LOG', label: 'ログ追跡' });
            if (p.role === 'セキュリティ分析官') skillPool.push({ skill: 'PATCH', label: 'パッチ' });
            if (p.role === 'DBエンジニア') skillPool.push({ skill: 'MASKING', label: 'マスキング' });
            if (p.role === 'システムオペレーター') skillPool.push({ skill: 'TRANSFER', label: 'リソース譲渡' });
            if (p.role === 'DevOps') skillPool.push({ skill: 'PIPELINE', label: 'パイプライン' });
        });
        if (skillPool.length > 0) {
            const chosen = skillPool[Math.floor(Math.random() * skillPool.length)];
            player.copiedSkill = chosen.skill;
            player.copiedSkillLabel = chosen.label;
            io.to(player.id).emit('private_message', {
                senderId: 'SYSTEM',
                senderName: 'Replicator',
                message: `スキルコピー完了: [${chosen.label}] を習得しました。(1回限り使用可能)`,
            });
            addLog(io, gameState, `レプリケーション: スキルデータの複製が完了しました。`, 'info', executorName, spectatorIds, roomId);
        }
    }
    else if (data.type === 'DEBUG') {
        player.apSpentThisTurn = Math.max(0, player.apSpentThisTurn - 1);
        addLog(io, gameState, `デバッグ作業: リソースが最適化されました。`, 'info', executorName, spectatorIds, roomId);
    }
    else if (data.type === 'PIPELINE') {
        const target = gameState.players.find(p => p.id === data.targetId);
        if (target) {
            target.pipelineActive = true;
            target.pipelinePartnerId = player.id;
            addLog(io, gameState, `CI/CDパイプライン構築: ${target.name} に対する支援接続が確立されました。対象が証拠解析を実行するとBOT効率UP！`, 'info', executorName, spectatorIds, roomId);
        }
    }
    else if (data.type === 'IP_BLOCK') {
        const target = gameState.players.find(p => p.id === data.targetId);
        if (target) {
            if (target.isPatched) {
                target.isPatched = false; // パッチ消費
                addLog(io, gameState, `通信遮断(IP BLOCK)試行。セキュリティパッチにより防護されました。`, 'info', executorName, spectatorIds, roomId);
            } else {
                target.isIpBlockedNextTurn = true;
                addLog(io, gameState, `通信遮断(IP BLOCK): 端末への接続が強制遮断されました。(次ターン適用)`, 'warn', executorName, spectatorIds, roomId);
            }
        }
    }
    else if (data.type === 'FIREWALL') {
        gameState.firewallActive = true;
        addLog(io, gameState, `ファイアウォール展開: システム防御壁が有効化されました。(次の攻撃1回をブロック)`, 'info', undefined, spectatorIds, roomId);
    }
    else if (data.type === 'HONEY_POT') {
        gameState.honeyPotActive = true;
        addLog(io, gameState, `ハニーポット設置: 誘引トラップが仕掛けられました。`, 'info', undefined, spectatorIds, roomId);
    }
    else if (data.type === 'RESTORE') {
        gameState.restoreActive = true;
        addLog(io, gameState, `システム・リストア準備: 緊急復旧プロトコルがセットされました。(HP0時に自動発動)`, 'info', undefined, spectatorIds, roomId);
    }
    else if (data.type === 'SPEC_UP') {
        gameState.maxHp = 120;
        gameState.specUpTurnsRemaining = 2;
        addLog(io, gameState, `スペックアップ: サーバーリソース増強。HP上限が120に拡張されました。(2ターン持続)`, 'info', undefined, spectatorIds, roomId);
    }
    else if (data.type === 'DEPLOY_BOT') {
        if ((player.isMurderer || player.isHacker) && player.role === 'DevOps') {
            if (data.cost > 0) {
                player.apSpentThisTurn -= data.cost;
                gameState.totalActualAp -= data.cost;
            }
        }
        gameState.devOpsBots = Math.min(3, gameState.devOpsBots + 1);
        addLog(io, gameState, `解析ボット配備: 現在稼働数 ${gameState.devOpsBots}台。`, 'info', executorName, spectatorIds, roomId);
    }
    else if (data.type === 'RESTORE_SYSTEM') {
        gameState.hp = Math.min(gameState.maxHp, gameState.hp + 10);
        addLog(io, gameState, `システムパッチ適用。HP回復。`, 'info', executorName, spectatorIds, roomId);
    }
    else if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') {
        gameState.currentTurnAttackActions++;
        if (gameState.firewallActive) {
            addLog(io, gameState, `データ持ち出し阻止。ファイアウォール作動。`, 'info', executorName, spectatorIds, roomId);
            gameState.firewallActive = false;
        } else {
            let leakAmount = 15;
            if (gameState.maskingActive) {
                leakAmount -= 5;
                gameState.maskingActive = false;
                addLog(io, gameState, `マスキング効果発動: データ漏洩が軽減されました (-5%)。`, 'system', undefined, spectatorIds, roomId);
            }
            gameState.leak = Math.min(100, gameState.leak + leakAmount);
            addLog(io, gameState, `データ持ち出し検知。送信元: [不明]。`, 'critical', executorName, spectatorIds, roomId);
            if (gameState.honeyPotActive) {
                const dbEngineer = gameState.players.find(p => p.role === 'DBエンジニア');
                if (dbEngineer) {
                    io.to(dbEngineer.id).emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'HoneyPot',
                        message: `[ハニーポット作動] データ持ち出し実行者を特定: ${executorName}`,
                    });
                }
                gameState.honeyPotActive = false;
            }
        }
        player.performedHackerAction = true;
    }
    else if (data.type === 'ANALYZE_EVIDENCE') {
        if (!player.isMurderer) {
            const amount = 10;
            gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + amount);
        }
        addLog(io, gameState, `証拠解析完了。`, 'info', executorName, spectatorIds, roomId);
        checkWinCondition(io, gameState, spectatorIds, roomId);
    }
    else if (data.type === 'ENCRYPT_DATA') {
        gameState.leak = Math.max(0, gameState.leak - 10);
        addLog(io, gameState, `データ暗号化完了。漏洩リスク低減。`, 'info', executorName, spectatorIds, roomId);
    }
    else if (data.type === 'VIEW_AUDIT_LOG') {
        const total = gameState.previousTurnAttackActions + gameState.previousTurnManipActions;
        io.to(player.id).emit('private_message', {
            senderId: 'SYSTEM',
            senderName: 'AuditScanner',
            message: `[監査報告] 前サイクルにおける不正タスク: ${total}件 (ハッカー行動: ${gameState.previousTurnAttackActions}, 殺人犯行動: ${gameState.previousTurnManipActions})`,
        });
    }
    else if (data.type === 'COVER_TRACKS') {
        gameState.currentTurnManipActions++;
        player.performedHackerAction = false;
        player.lastTurnHackerAction = false;
        io.to(player.id).emit('private_message', {
            senderId: 'SYSTEM',
            senderName: 'HackerOS',
            message: `痕跡消去完了。ログ追跡の結果がNEGATIVEにリセットされました。`,
        });
    }
    else if (data.type === 'DDOS') {
        gameState.currentTurnAttackActions++;
        if (player.isHacker) {
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                if (target.isPatched) {
                    target.isPatched = false; // パッチ消費
                    addLog(io, gameState, `警告: ネットワーク上の異常なリソース消費を検知。セキュリティパッチにより防護されました。`, 'info', executorName, spectatorIds, roomId);
                } else {
                    target.apDebuff += 2; // Fixed to += in case of multiple debuffs
                    addLog(io, gameState, `警告: ネットワーク上の異常なリソース消費を検知。`, 'critical', executorName, spectatorIds, roomId);
                    io.to(target.id).emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'SystemAlert',
                        message: `あなたの端末がDDOS攻撃を受けました。次ターンのAP -2。`,
                    });
                }
            }
            player.performedHackerAction = true;
        }
    }
    else if (data.type === 'FALSE_FLAG') {
        gameState.currentTurnManipActions++;
        if (player.isHacker || player.isMurderer) {
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                target.isFalseFlagged = true;
                if (socket) {
                    socket.emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'HackerOS',
                        message: `${target.name} に偽装工作を実行。ログ追跡の結果はPOSITIVEとなります。`,
                    });
                }
            }
            player.performedHackerAction = true;
        }
    }
    else if (data.type === 'TAMPER_EVIDENCE') {
        gameState.currentTurnManipActions++;
        if (player.isMurderer) {
            gameState.evidenceAnalysisProgress = Math.max(0, gameState.evidenceAnalysisProgress - 5);
            addLog(io, gameState, `警告: 証拠ログのデータ破損を検知。`, 'critical', executorName, spectatorIds, roomId);
            player.performedHackerAction = true;
        }
    }
    else if (data.type === 'SABOTAGE') {
        gameState.currentTurnManipActions++;
        if (player.isMurderer) {
            if (gameState.firewallActive) {
                addLog(io, gameState, `サボタージュ試行を検知。ファイアウォールによりブロックされました。`, 'info', executorName, spectatorIds, roomId);
                gameState.firewallActive = false;
            } else {
                gameState.hp = Math.max(0, gameState.hp - 5);
                addLog(io, gameState, `システムグリッチ検知。内部サボタージュの疑いあり。`, 'warn', executorName, spectatorIds, roomId);
            }
            player.performedHackerAction = true;
        }
    }
    else if (data.type === 'LOCKOUT') {
        gameState.currentTurnManipActions++;
        if (player.isMurderer) {
            player.performedHackerAction = true;
            if (gameState.firewallActive) {
                addLog(io, gameState, `ロックアウト試行を検知。ファイアウォールによりブロックされました。`, 'info', executorName, spectatorIds, roomId);
                gameState.firewallActive = false;
            } else {
                const target = gameState.players.find(p => p.id === data.targetId);
                if (target) {
                    if (target.isPatched) {
                        target.isPatched = false; // パッチ消費
                        addLog(io, gameState, `端末に対するセキュリティロックアウト試行。セキュリティパッチにより防護されました。`, 'info', executorName, spectatorIds, roomId);
                    } else {
                        target.apDebuff += 3; // Fixed to +=
                        addLog(io, gameState, `端末に対するセキュリティロックアウトを開始。`, 'critical', executorName, spectatorIds, roomId);
                        io.to(target.id).emit('private_message', {
                            senderId: 'SYSTEM',
                            senderName: 'AdminAuth',
                            message: `あなたの端末はロックアウトされました。次ターンのAP -3。`,
                        });
                    }
                }
            }
        }
    }
    else if (data.type === 'BLACKOUT') {
        gameState.currentTurnManipActions++;
        if (player.isMurderer || player.isHacker) {
            gameState.blackoutActive = true;
            addLog(io, gameState, `警告: 電力供給システムの異常を検知。停電の恐れあり。`, 'critical', executorName, spectatorIds, roomId);
        }
    }
    else if (data.type === 'PHYSICAL_DESTROY') {
        gameState.currentTurnManipActions++;
        if (player.isMurderer || player.isHacker) {
            if ((player.isMurderer || player.isHacker) && player.role === 'DevOps' && data.cost > 0) {
                player.apSpentThisTurn -= data.cost;
                gameState.totalActualAp -= data.cost;
            }
            if (gameState.devOpsBots > 0) {
                gameState.devOpsBots--;
                addLog(io, gameState, `警告: サーバー室で火災発生。解析ノードが破壊されました。`, 'critical', executorName, spectatorIds, roomId);
            } else {
                addLog(io, gameState, `ノード・デストラクションを実行したが、対象が存在しませんでした。`, 'warn', executorName, spectatorIds, roomId);
            }
            player.performedHackerAction = true;
        }
    }

    // --- HPチェック (リストアの発動) ---
    if (gameState.hp <= 0 && gameState.restoreActive) {
        gameState.hp = 20;
        gameState.restoreActive = false;
        addLog(io, gameState, `システム・リストア発動: 致命的なエラーから復旧しました。(HP 0 -> 20)`, 'system', undefined, spectatorIds, roomId);
    }

    // アクション結果により決着がついたかチェック
    checkWinCondition(io, gameState, spectatorIds, roomId);

    const emitTarget = roomId ? io.to(roomId) : io;
    emitTarget.emit('state_update', gameState);

    return updatedPending;
}

// ----------------------------------------------------------
// 最終投票集計
// ----------------------------------------------------------

/**
 * 最終投票を集計し、ゲーム結果を決定する
 */
export function tallyFinalVotes(
    io: Server,
    gameState: GameState,
    spectatorIds?: Set<string>,
    roomId?: string,
): void {
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

    addLog(io, gameState, `=== 最終投票結果 ===`, 'system', undefined, spectatorIds, roomId);
    addLog(io, gameState, `殺人犯 告発対象: ${murdererGuessName} (${maxMurdererVotes}票) → ${murdererCorrect ? '正解 ✓' : '不正解 ✗'}`, 'system', undefined, spectatorIds, roomId);
    addLog(io, gameState, `ハッカー 告発対象: ${hackerGuessName} (${maxHackerVotes}票) → ${hackerCorrect ? '正解 ✓' : '不正解 ✗'}`, 'system', undefined, spectatorIds, roomId);
    addLog(io, gameState, `真の殺人犯: ${realMurderer?.name || '不明'}`, 'system', undefined, spectatorIds, roomId);
    addLog(io, gameState, `真のハッカー: ${realHacker?.name || '不明'}`, 'system', undefined, spectatorIds, roomId);

    if (murdererCorrect && hackerCorrect) {
        gameState.finalVotingResult = 'employee_perfect_win';
        addLog(io, gameState, `★ 社員勝利 ★ 裏切り者を全員特定しました！`, 'critical', undefined, spectatorIds, roomId);
    } else if (murdererCorrect) {
        gameState.finalVotingResult = 'employee_win';
        addLog(io, gameState, `〓 引き分け 〓 殺人犯を特定！しかしハッカーは逃走した...`, 'critical', undefined, spectatorIds, roomId);
    } else {
        gameState.finalVotingResult = 'murderer_escape';
        addLog(io, gameState, `✗ 殺人犯逃亡 ✗ 犯人は闇に消えました...`, 'critical', undefined, spectatorIds, roomId);
    }
    // --- 実績判定用データの送信 ---
    emitGameEndStats(io, gameState, gameState.finalVotingResult, roomId);

    gameState.isPaused = true;
    const emitTarget = roomId ? io.to(roomId) : io;
    emitTarget.emit('state_update', gameState);
}

// ----------------------------------------------------------
// 役割割り当て
// ----------------------------------------------------------

/**
 * プレイヤーにハッカー/殺人犯/社員の役割をランダムに割り当てる
 */
export function assignRoles(
    io: Server,
    gameState: GameState,
    spectatorIds?: Set<string>,
    roomId?: string,
): void {
    if (gameState.isGameStarted) return;

    const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);
    const shuffledRoles = [...ROLES].sort(() => Math.random() - 0.5);

    gameState.players.forEach((p, index) => {
        p.role = shuffledRoles[index];
        p.isHacker = false;
        p.isMurderer = false;
        p.secret = '';
    });

    // ハッカー割り当て
    if (shuffled.length > 0) {
        const hacker = gameState.players.find(p => p.id === shuffled[0].id);
        if (hacker) {
            hacker.isHacker = true;
            hacker.secret = 'あなたはハッカーとしてシステムに潜入した。鈴木の死は好機だ。';
        }
    }

    // 殺人犯割り当て
    if (shuffled.length > 1) {
        const murderer = gameState.players.find(p => p.id === shuffled[1].id);
        if (murderer) {
            murderer.isMurderer = true;
            murderer.secret = 'あなたは18:00に鈴木を殺害した。明日の朝、鈴木に不正を公表される予定だったからだ。証拠ファイルを解析されると終わりだ。';
        }
    }

    gameState.isGameStarted = true;

    gameState.players.forEach(p => {
        p.votes = 0;
        p.isIsolated = false;
        p.chargedAp = 0;
        p.apSpentThisTurn = 0;
        p.apDebuff = 0;
        p.isIpBlocked = false;
        p.isIpBlockedNextTurn = false;
        p.performedHackerAction = false;
        p.lastTurnHackerAction = false;

        io.to(p.id).emit('role_assigned', {
            isHacker: p.isHacker,
            isMurderer: p.isMurderer,
            roleName: p.role,
            secret: p.secret,
        });
    });

    addLog(io, gameState, '役職割当完了。殺人犯1名、ハッカー1名が潜伏中。真実を暴け。', 'system', undefined, spectatorIds, roomId);
}

// ----------------------------------------------------------
// ターン進行（タイマーティック）
// ----------------------------------------------------------

/**
 * 1秒ごとのタイマーティック処理。
 * ゲーム状態を更新し、フェーズ遷移・ターン終了処理を行う。
 */
export function processTick(
    io: Server,
    gameState: GameState,
    pendingActions: PendingAction[],
    spectatorIds: Set<string>,
    roomId?: string,
): PendingAction[] {
    const emitTarget = roomId ? io.to(roomId) : io;

    // 状態送信（ハートビート）
    emitTarget.emit('state_update', gameState);

    // GM観戦者に役割情報を送信
    if (spectatorIds.size > 0 && gameState.isGameStarted) {
        const gmInfo = gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            isHacker: p.isHacker,
            isMurderer: p.isMurderer,
            isIsolated: p.isIsolated,
            votes: p.votes,
        }));
        spectatorIds.forEach(sid => {
            io.to(sid).emit('gm_info', gmInfo);
        });
    }

    if (gameState.isPaused || gameState.turn > 8 || gameState.phase === 'final_voting' || !gameState.isGameStarted) {
        return pendingActions;
    }

    gameState.timeLeft--;

    // デバッグログ (5秒ごと)
    if (gameState.timeLeft % 5 === 0) {
        console.log(`[DEBUG] Turn: ${gameState.turn}, Time: ${gameState.timeLeft}, Phase: ${gameState.phase}`);
    }

    // フェーズ遷移ロジック
    const elapsed = gameState.turnDuration - gameState.timeLeft;
    const ACTION_START = Math.floor(gameState.turnDuration * (40 / 60));
    const RESOLVE_START = Math.floor(gameState.turnDuration * (55 / 60));

    if (elapsed < ACTION_START) {
        if (gameState.phase !== 'discussion') {
            gameState.phase = 'discussion';
            emitTarget.emit('state_update', gameState);
        }
    } else if (elapsed < RESOLVE_START) {
        if (gameState.phase !== 'action') {
            gameState.phase = 'action';
            addLog(io, gameState, '>>> アクションフェーズ開始。コマンドを入力してください。 <<<', 'system', undefined, spectatorIds, roomId);
            emitTarget.emit('state_update', gameState);
        }
    } else {
        if (gameState.phase !== 'resolve') {
            gameState.phase = 'resolve';
            addLog(io, gameState, '>>> 解決フェーズ。全アクションを処理中... <<<', 'system', undefined, spectatorIds, roomId);
            checkWinCondition(io, gameState, spectatorIds, roomId);
            emitTarget.emit('state_update', gameState);
        }
    }

    // ターン終了
    if (gameState.timeLeft <= 0) {
        return processEndOfTurn(io, gameState, pendingActions, spectatorIds, roomId);
    }

    return pendingActions;
}

// ----------------------------------------------------------
// ターン終了処理
// ----------------------------------------------------------

/**
 * ターン終了時のすべての処理を実行する
 */
export function processEndOfTurn(
    io: Server,
    gameState: GameState,
    pendingActions: PendingAction[],
    spectatorIds: Set<string>,
    roomId?: string,
): PendingAction[] {
    const emitTarget = roomId ? io.to(roomId) : io;

    // DevOps Botの処理 (ターン終了時)
    if (gameState.devOpsBots > 0) {
        let pipelineBonus = 0;
        const hookedPlayer = gameState.players.find(p => p.pipelineActive);
        if (hookedPlayer && hookedPlayer.analyzedThisTurn) {
            pipelineBonus = 2;
            addLog(io, gameState, `CI/CDパイプラインボーナス発動: 対象ノードの解析完了によりBOT効率が向上しました。(BOT1台あたり +${pipelineBonus}%)`, 'info', undefined, spectatorIds, roomId);
        }

        const botProgressPerUnit = 3 + pipelineBonus;
        const botProgress = gameState.devOpsBots * botProgressPerUnit;
        gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + botProgress);
        addLog(io, gameState, `自動セキュリティBOTによる解析処理: ${gameState.devOpsBots}台 × ${botProgressPerUnit}% = +${botProgress}%`, 'info', undefined, spectatorIds, roomId);
        checkWinCondition(io, gameState, spectatorIds, roomId);
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

    const candidates = gameState.players.filter(p => p.votes === maxVotes && maxVotes > 0);
    if (candidates.length === 1) {
        const victim = candidates[0];
        victim.apDebuff += 3;
        victim.isIsolated = true;
        addLog(io, gameState, `投票結果: ${victim.name} のネットワーク権限が制限されました (-3 AP)。`, 'warn', undefined, spectatorIds, roomId);
    } else if (candidates.length > 1) {
        addLog(io, gameState, `投票結果: 最多得票が同数のため、権限制限は見送られました。`, 'info', undefined, spectatorIds, roomId);
    }

    // AP不一致のログ出力
    const variance = gameState.totalActualAp - gameState.totalPublicAp;
    addLog(io, gameState, `[ターン報告] 公称AP: ${gameState.totalPublicAp} | 実システム負荷: ${gameState.totalActualAp}`, 'system', undefined, spectatorIds, roomId);
    if (variance > 0) {
        addLog(io, gameState, `警告: ${variance} APの異常値を検知。不審なバックグラウンドプロセスを確認。`, 'critical', undefined, spectatorIds, roomId);
    }

    // Turn 8 終了時 → 最終投票フェーズへ
    if (gameState.turn >= 8) {
        gameState.phase = 'final_voting';
        gameState.timeLeft = 0;
        gameState.finalVotesMurderer = {};
        gameState.finalVotesHacker = {};
        gameState.finalVotingComplete = false;
        gameState.finalVotingResult = 'none';
        addLog(io, gameState, '>>> 全8ターン終了。最終投票フェーズ: 殺人犯とハッカーを特定せよ。 <<<', 'system', undefined, spectatorIds, roomId);
        emitTarget.emit('state_update', gameState);
        return pendingActions;
    }

    // --- 次ターンの準備 ---
    gameState.previousTurnAttackActions = gameState.currentTurnAttackActions;
    gameState.previousTurnManipActions = gameState.currentTurnManipActions;
    gameState.currentTurnAttackActions = 0;
    gameState.currentTurnManipActions = 0;
    gameState.turn++;

    if (gameState.blackoutActive) {
        gameState.timeLeft = Math.floor(gameState.turnDuration / 2);
        gameState.blackoutActive = false;
        addLog(io, gameState, `停電の影響により、メインコアの電力が制限されています：第 ${gameState.turn} ターンの議論時間が半減しました。`, 'critical', undefined, spectatorIds, roomId);
    } else {
        gameState.timeLeft = gameState.turnDuration;
    }

    gameState.phase = 'discussion';
    gameState.totalPublicAp = 0;
    gameState.totalActualAp = 0;

    // SpecUp処理
    if (gameState.specUpTurnsRemaining > 0) {
        gameState.specUpTurnsRemaining--;
        if (gameState.specUpTurnsRemaining === 0) {
            gameState.maxHp = 100;
            if (gameState.hp > 100) gameState.hp = 100;
            addLog(io, gameState, `スペックアップ効果終了: システムリソースが通常状態に戻りました。`, 'system', undefined, spectatorIds, roomId);
        }
    }

    gameState.restoreActive = false;
    gameState.blackoutActive = false;
    gameState.votedPlayers = {};

    gameState.players.forEach(p => {
        p.votes = 0;
        p.lastTurnHackerAction = p.performedHackerAction;
        p.performedHackerAction = false;
        p.isIsolated = false;
        p.transferUsedThisTurn = false;
        p.malwareUsedThisTurn = 0;
        p.exfilUsedThisTurn = 0;
        p.deployBotUsedThisTurn = 0;
        p.copiedSkill = null;
        p.copiedSkillLabel = null;

        // AP処理: チャージ計算 → デバフ適用 → 残りを繰越
        if (p.isHacker || p.isMurderer) {
            const thisTurnMaxAp = 3 + p.chargedAp;
            let remaining = Math.max(0, thisTurnMaxAp - p.apSpentThisTurn);
            let debuffToClient = 0;

            if (p.isPatched && p.apDebuff > 0) {
                p.isPatched = false; // パッチ消費
                addLog(io, gameState, `防御発動: デバフ攻撃がパッチにより無効化されました。`, 'info', undefined, spectatorIds, roomId);
                p.apDebuff = 0; // デバフを無効化
            }
            if (p.apDebuff > 0) {
                remaining = Math.max(0, remaining - p.apDebuff);
                debuffToClient = p.apDebuff;
                addLog(io, gameState, `ネットワーク遅延: リソースが制限されました (-${p.apDebuff} AP)。`, 'warn', undefined, spectatorIds, roomId);
            }

            p.chargedAp = Math.min(3, remaining) + (p.transferBonusNextTurn || 0);

            if (p.chargedAp > 0) {
                io.to(p.id).emit('private_message', {
                    senderId: 'SYSTEM',
                    senderName: 'PowerManager',
                    message: `APチャージ: ${p.chargedAp} (次ターンAP: ${3 + p.chargedAp})`,
                });
            }

            io.to(p.id).emit('ap_debuff', { amount: debuffToClient, chargedAp: p.chargedAp });
        } else {
            const employeeCharge = p.transferBonusNextTurn || 0;
            if (p.isPatched && p.apDebuff > 0) {
                p.isPatched = false; // パッチ消費
                addLog(io, gameState, `防御発動: デバフ攻撃がパッチにより無効化されました。`, 'info', undefined, spectatorIds, roomId);
                p.apDebuff = 0; // デバフ無効化
            }
            if (p.apDebuff > 0) {
                addLog(io, gameState, `ネットワーク遅延: リソースが制限されました (-${p.apDebuff} AP)。`, 'warn', undefined, spectatorIds, roomId);
                io.to(p.id).emit('ap_debuff', { amount: p.apDebuff, chargedAp: employeeCharge });
            } else {
                io.to(p.id).emit('ap_debuff', { amount: 0, chargedAp: employeeCharge });
            }
            p.chargedAp = employeeCharge;
        }
    });

    // ターン終了時にフラグリセット
    gameState.players.forEach(p => {
        p.apSpentThisTurn = 0;
        p.apDebuff = 0;
        if (p.isPatched && p.isIpBlockedNextTurn) {
            p.isPatched = false; // パッチ消費
            addLog(io, gameState, `防御発動: IPブロックがパッチにより無効化されました。`, 'info', undefined, spectatorIds, roomId);
            p.isIpBlockedNextTurn = false;
        }
        p.isIpBlocked = p.isIpBlockedNextTurn;
        p.isIpBlockedNextTurn = false;
        p.isPatched = false;
        p.pipelineActive = false;
        p.pipelinePartnerId = null;
        p.analyzedThisTurn = false;
        p.isFalseFlagged = false;
        p.transferBonusNextTurn = 0;
        p.nullifyUsedThisTurn = false;
    });

    // 詠唱待機中のアクションを全て破棄 (ターン跨ぎ実行防止)
    pendingActions.forEach(pa => clearTimeout(pa.timerId));
    const clearedPending: PendingAction[] = [];
    gameState.hasPendingActions = false;

    // Masking更新は削除（即時適用に変更済みのため）

    addLog(io, gameState, `ターン ${gameState.turn - 1} 終了。ターン ${gameState.turn} を開始します。`, 'system', undefined, spectatorIds, roomId);
    emitTarget.emit('state_update', gameState);

    return clearedPending;
}
