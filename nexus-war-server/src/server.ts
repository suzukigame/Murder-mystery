import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

import { GameState, PendingAction, createDefaultPlayer } from './types';
import {
    getInitialState,
    addLog,
    executePendingAction,
    checkWinCondition,
    tallyFinalVotes,
    assignRoles,
    processTick,
    CHANT_DURATION,
} from './gameLogic';

// ----------------------------------------------------------
// Express + Socket.io セットアップ
// ----------------------------------------------------------

const app = express();
app.use(cors());

// フロントエンドのビルド成果物のパス (プロジェクト: SKY-MAGYCC JUDAS)
const clientDistPath = path.resolve(__dirname, '../../nexus-war-app/dist');
app.use(express.static(clientDistPath));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// ----------------------------------------------------------
// ゲーム状態（グローバル — Phase 2 で RoomManager に移行予定）
// ----------------------------------------------------------

let gameState: GameState = getInitialState();
let pendingActions: PendingAction[] = [];

// GM観戦者のSocket IDセット
const spectatorIds = new Set<string>();

// ----------------------------------------------------------
// 1秒ごとのタイマー処理
// ----------------------------------------------------------

setInterval(() => {
    pendingActions = processTick(io, gameState, pendingActions, spectatorIds);
}, 1000);

// ----------------------------------------------------------
// Socket.io イベントハンドラ
// ----------------------------------------------------------

io.on('connection', (socket) => {
    console.log('--- NEW CLIENT CONNECTED ---', socket.id);

    // 初期状態送信
    socket.emit('state_update', gameState);
    socket.emit('log_history', gameState.logs);

    // ----- 参加登録 -----
    socket.on('join_game', (data: { name: string; role: string; token?: string }) => {
        // 名前で既存プレイヤーを検索 (再接続対応)
        const existingByName = gameState.players.find(p => p.name === data.name);

        if (existingByName) {
            // トークンが一致する場合のみ再接続を許可
            if (data.token === existingByName.sessionToken) {
                existingByName.id = socket.id;
                addLog(io, gameState, `再接続: ${data.name} 復帰しました。`, 'system');

                if (gameState.isGameStarted) {
                    socket.emit('role_assigned', {
                        isHacker: existingByName.isHacker,
                        isMurderer: existingByName.isMurderer,
                        roleName: existingByName.role,
                        secret: existingByName.secret,
                    });
                }

                socket.emit('join_success', { name: existingByName.name, token: existingByName.sessionToken });
                io.emit('state_update', gameState);
                return;
            }

            socket.emit('error', 'このキャラクターは既に他のプレイヤーが選択しています。以前のセッション情報の復元に失敗しました。');
            return;
        }

        const existingById = gameState.players.find(p => p.id === socket.id);
        if (!existingById) {
            const newToken = Math.random().toString(36).substring(2, 15);
            gameState.players.push(createDefaultPlayer(socket.id, data.name, data.role, newToken));
            addLog(io, gameState, `新規接続: ${data.name} 確立。`, 'system');

            socket.emit('join_success', { name: data.name, token: newToken });

            // 6人揃っていて、かつ未開始なら役割を割り当てる
            if (gameState.players.length === 6 && !gameState.isGameStarted) {
                assignRoles(io, gameState, spectatorIds);
            }

            io.emit('state_update', gameState);
        }
    });

    // ----- GM観戦モード入室 -----
    socket.on('join_spectator', () => {
        spectatorIds.add(socket.id);
        console.log('--- NEW GM SPECTATOR CONNECTED ---', socket.id);
        socket.emit('spectator_confirmed');
        socket.emit('log_history', gameState.logs);

        if (gameState.isGameStarted) {
            const gmInfo = gameState.players.map(p => ({
                id: p.id,
                name: p.name,
                role: p.role,
                isHacker: p.isHacker,
                isMurderer: p.isMurderer,
                isIsolated: p.isIsolated,
                votes: p.votes,
            }));
            socket.emit('gm_info', gmInfo);
        }
    });

    // ----- 退室 -----
    socket.on('leave_game', () => {
        if (spectatorIds.has(socket.id)) {
            spectatorIds.delete(socket.id);
            addLog(io, gameState, '観戦者が退室しました。', 'system');
            return;
        }

        const index = gameState.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
            const player = gameState.players[index];
            addLog(io, gameState, `退室: ${player.name} がロビーに戻りました。`, 'system');
            gameState.players.splice(index, 1);

            // 全員退室したらゲーム状態をリセット
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
                    content: '全プレイヤーが退室しました。ゲーム状態をリセットし、設定変更を受け付けます。',
                });
                spectatorIds.clear();
            }

            io.emit('state_update', gameState);
        }
    });

    // ----- 設定変更 -----
    socket.on('update_settings', (data: { turnDuration?: number }) => {
        if (gameState.isGameStarted) return;

        if (data.turnDuration !== undefined) {
            gameState.turnDuration = data.turnDuration;
            gameState.timeLeft = data.turnDuration;
            addLog(io, gameState, `システム設定変更: 1ターンの時間を ${data.turnDuration} 秒に設定しました。`, 'system');
        }
        io.emit('state_update', gameState);
    });

    // ----- アクション -----
    socket.on('action', (data: { type: string; cost: number; targetId?: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player) return;

        // NULLIFY (無効化) アクションの即時処理
        if (data.type === 'NULLIFY') {
            if (!player.isMurderer) {
                socket.emit('error', 'このアクションは殺人犯専用です。');
                return;
            }
            if (player.nullifyUsedThisTurn) {
                socket.emit('error', '無効化は1ターンに1回までです。');
                return;
            }
            if (pendingActions.length === 0) {
                socket.emit('error', '現在、無効化可能なアクションはありません。');
                return;
            }

            player.nullifyUsedThisTurn = true;
            addLog(io, gameState, `>>> 異常なパケット干渉を検知。実行中の全アクションが強制終了されました。 <<<`, 'critical', player.name, spectatorIds);

            pendingActions.forEach(pa => clearTimeout(pa.timerId));
            pendingActions = [];
            gameState.hasPendingActions = false;
            io.emit('state_update', gameState);
            return;
        }

        // 投票による隔離（行動不能）のチェック
        if (player.isIsolated) {
            socket.emit('error', 'アクセス権限が制限されています（行動不能状態）。');
            return;
        }

        // サーバー側での厳密なAPチェック
        const ap = 3 - player.apDebuff + player.transferBonusNextTurn + player.chargedAp - player.apSpentThisTurn;
        if (ap < data.cost) {
            socket.emit('error', 'AP不足です。');
            return;
        }

        const isHackerAction = ['INJECT_MALWARE', 'EXFILTRATE', 'EXFIL', 'TAMPER_EVIDENCE', 'DDOS', 'FALSE_FLAG', 'SABOTAGE', 'LOCKOUT', 'BLACKOUT', 'PHYSICAL_DESTROY'].includes(data.type);
        const isMurdererAction = ['TAMPER_EVIDENCE', 'SABOTAGE', 'LOCKOUT', 'FALSE_FLAG', 'BLACKOUT', 'PHYSICAL_DESTROY'].includes(data.type);
        const publicCost = isHackerAction ? 0 : data.cost;

        // コピーしたスキルの使用判定
        const isUsingCopiedSkill = player.copiedSkill === data.type;

        if (isHackerAction && !player.isHacker && !(isMurdererAction && player.isMurderer) && !isUsingCopiedSkill) {
            socket.emit('error', '不正アクセス: ROOT権限が必要です。');
            return;
        }

        // 行動阻害チェック (IP_BLOCK)
        if (player.isIpBlocked) {
            socket.emit('error', '通信遮断: IPブロックによりアクションが拒否されました。');
            return;
        }

        // 固有スキルの回数制限チェック
        if ((data.type === 'INJECT_MALWARE' || data.type === 'INJECT') && player.malwareUsedThisTurn >= 1) {
            socket.emit('error', 'リミット到達: マルウェアは1ターンに1回までです。');
            return;
        }
        if ((data.type === 'EXFILTRATE' || data.type === 'EXFIL') && player.exfilUsedThisTurn >= 3) {
            socket.emit('error', 'リミット到達: 持ち出しは1ターンに3回までです。');
            return;
        }
        if (data.type === 'TRANSFER' && player.transferUsedThisTurn) {
            socket.emit('error', 'クールダウン中: リソース譲渡は1ターンに1回のみです。');
            return;
        }
        if (data.type === 'DEPLOY_BOT' && player.deployBotUsedThisTurn >= 1) {
            socket.emit('error', '解析BOT配備は1ターンに1回までです。');
            return;
        }

        // アクションを保留キューに追加 (Action Chanting)
        player.apSpentThisTurn += data.cost;
        gameState.totalPublicAp += publicCost;
        gameState.totalActualAp += data.cost;

        if (isHackerAction) {
            player.performedHackerAction = true;
        }

        // コピーしたスキルを消費する
        if (isUsingCopiedSkill) {
            player.copiedSkill = null;
            player.copiedSkillLabel = null;
        }

        // 個別のフラグ更新
        if (data.type === 'INJECT_MALWARE' || data.type === 'INJECT') player.malwareUsedThisTurn++;
        if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') player.exfilUsedThisTurn++;
        if (data.type === 'TRANSFER') player.transferUsedThisTurn = true;
        if (data.type === 'DEPLOY_BOT') player.deployBotUsedThisTurn++;
        if (data.type === 'ANALYZE_EVIDENCE') player.analyzedThisTurn = true;

        const newPendingAction: PendingAction = {
            playerId: player.id,
            playerName: player.name,
            socketId: socket.id,
            actionType: data.type,
            targetId: data.targetId,
            cost: data.cost,
            isHackerAction,
            publicCost,
            timerId: setTimeout(() => {
                pendingActions = executePendingAction(io, gameState, pendingActions, newPendingAction, spectatorIds);
            }, CHANT_DURATION),
        };

        pendingActions.push(newPendingAction);
        gameState.hasPendingActions = true;
        io.emit('state_update', gameState);
    });

    // ----- チャット受信 -----
    socket.on('chat_message', (data: { targetId: string; message: string; senderName: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const name = player ? player.name : data.senderName;

        addLog(io, gameState, 'ENCRYPTED COMMUNICATION DETECTED.', 'warn', name, spectatorIds);

        io.to(data.targetId).emit('private_message', {
            senderId: socket.id,
            senderName: name,
            message: data.message,
        });
    });

    // ----- 切断 -----
    socket.on('disconnect', () => {
        if (spectatorIds.has(socket.id)) {
            spectatorIds.delete(socket.id);
            console.log('Spectator disconnected:', socket.id);
            return;
        }
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = gameState.players[playerIndex];
            addLog(io, gameState, `CONNECTION SUSPENDED: ${player.name} (Wait for re-auth)`, 'warn');
            io.emit('state_update', gameState);
        }
        console.log('Client disconnected:', socket.id);
    });

    // ----- ゲームリセット -----
    socket.on('reset_game', () => {
        const currentPlayers = gameState.players;
        const currentDuration = gameState.turnDuration;
        gameState = getInitialState(currentDuration);
        gameState.players = currentPlayers;
        addLog(io, gameState, 'SYSTEM REBOOT INITIATED... NEW SESSION STARTED.', 'system');

        if (gameState.players.length === 6) {
            assignRoles(io, gameState, spectatorIds);
        }

        io.emit('state_update', gameState);
        io.emit('log_history', []);
    });

    // ----- プレイヤーリスト完全リセット -----
    socket.on('clear_players', () => {
        gameState.players = [];
        gameState.isGameStarted = false;
        addLog(io, gameState, 'PLAYER LIST CLEARED BY OPERATOR.', 'system');
        io.emit('state_update', gameState);
    });

    // ----- 投票受付 -----
    socket.on('vote', (data: { targetId: string }) => {
        const voter = gameState.players.find(p => p.id === socket.id);
        const target = gameState.players.find(p => p.id === data.targetId);

        if (voter && target && gameState.isGameStarted) {
            const previousTargetId = gameState.votedPlayers[socket.id];
            if (previousTargetId) {
                const prevTarget = gameState.players.find(p => p.id === previousTargetId);
                if (prevTarget) prevTarget.votes = Math.max(0, prevTarget.votes - 1);
            }

            gameState.votedPlayers[socket.id] = data.targetId;
            target.votes++;

            addLog(io, gameState, 'ANONYMOUS VOTE RECORDED.', 'system');
            io.emit('state_update', gameState);
        }
    });

    // ----- 投票取消 -----
    socket.on('cancel_vote', () => {
        const voter = gameState.players.find(p => p.id === socket.id);
        if (voter && gameState.isGameStarted) {
            const previousTargetId = gameState.votedPlayers[socket.id];
            if (previousTargetId) {
                const prevTarget = gameState.players.find(p => p.id === previousTargetId);
                if (prevTarget) prevTarget.votes = Math.max(0, prevTarget.votes - 1);
                delete gameState.votedPlayers[socket.id];
                addLog(io, gameState, 'ANONYMOUS VOTE RETRACTED.', 'system');
                io.emit('state_update', gameState);
            }
        }
    });

    // ----- 最終投票受付 -----
    socket.on('final_vote', (data: { murdererVote: string; hackerVote: string }) => {
        if (gameState.phase !== 'final_voting') return;
        const voter = gameState.players.find(p => p.id === socket.id);
        if (!voter) return;

        gameState.finalVotesMurderer[socket.id] = data.murdererVote;
        gameState.finalVotesHacker[socket.id] = data.hackerVote;
        addLog(io, gameState, `${voter.name} HAS SUBMITTED FINAL IDENTIFICATION.`, 'system');
        io.emit('state_update', gameState);

        const totalVoters = gameState.players.length;
        const votedCount = Object.keys(gameState.finalVotesMurderer).length;
        if (votedCount >= totalVoters) {
            tallyFinalVotes(io, gameState, spectatorIds);
        }
    });

    // ----- 最終投票集計 (GM手動トリガー) -----
    socket.on('tally_final_votes', () => {
        if (gameState.phase !== 'final_voting') return;
        tallyFinalVotes(io, gameState, spectatorIds);
    });

    // ----- 強制ゲーム開始 (デバッグ用) -----
    socket.on('start_game_force', () => {
        if (gameState.players.length > 0) {
            assignRoles(io, gameState, spectatorIds);
            addLog(io, gameState, 'SYSTEM OVERRIDE: GAME STARTED BY OPERATOR.', 'system');
            io.emit('state_update', gameState);
        }
    });
});

// SPA対応
app.use((req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
