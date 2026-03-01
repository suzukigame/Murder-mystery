import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

import { createDefaultPlayer } from './types';
import {
    addLog,
    executePendingAction,
    assignRoles,
    processTick,
    tallyFinalVotes,
    getInitialState,
    CHANT_DURATION,
} from './gameLogic';
import { roomManager, Room } from './RoomManager';

// ----------------------------------------------------------
// Express + Socket.io セットアップ
// ----------------------------------------------------------

const app = express();
app.use(cors());

// フロントエンドのビルド成果物のパス
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
// ヘルパー: ルーム情報の配信
// ----------------------------------------------------------
const broadcastRoomList = () => {
    io.emit('room_list', roomManager.getAllRooms());
};

// ----------------------------------------------------------
// Socket.io イベントハンドラ
// ----------------------------------------------------------

io.on('connection', (socket) => {
    console.log('--- NEW CLIENT CONNECTED ---', socket.id);

    // 接続時にルーム一覧を送信
    socket.emit('room_list', roomManager.getAllRooms());

    // ----- ルーム一覧取得 -----
    socket.on('list_rooms', () => {
        socket.emit('room_list', roomManager.getAllRooms());
    });

    // ----- ルーム作成 -----
    socket.on('create_room', (data: { roomId: string; name: string }) => {
        if (!data.roomId || !data.name) {
            socket.emit('error', 'ルームIDとルーム名を入力してください。');
            return;
        }
        if (!roomManager.isIdAvailable(data.roomId)) {
            socket.emit('error', 'そのルームIDは既に使用されています。');
            return;
        }

        const room = roomManager.createRoom(data.roomId, data.name);
        console.log(`Room created: ${room.name} (${room.id})`);

        // タイマー開始 (ルーム単位)
        room.timerId = setInterval(() => {
            room.pendingActions = processTick(io, room.gameState, room.pendingActions, room.spectatorIds, room.id);
        }, 1000);

        broadcastRoomList();
        socket.emit('create_room_success', { roomId: room.id });
    });

    // ----- ルーム参加 -----
    socket.on('join_room', (roomId: string) => {
        const room = roomManager.getRoom(roomId);
        if (!room) {
            socket.emit('error', '指定されたルームが見つかりません。');
            return;
        }

        // Socket.ioのルームに参加
        socket.join(roomId);
        (socket as any).roomId = roomId; // 簡易的にソケットに保存

        socket.emit('join_room_success', { roomId: room.id, roomName: room.name });
        socket.emit('state_update', room.gameState);
        socket.emit('log_history', room.gameState.logs);
    });

    // ----- ゲーム参加登録 (ルーム内) -----
    socket.on('join_game', (data: { name: string; role: string; token?: string }) => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room) {
            socket.emit('error', 'ルームに所属していません。');
            return;
        }

        const gameState = room.gameState;
        const existingByName = gameState.players.find(p => p.name === data.name);

        if (existingByName) {
            if (data.token === existingByName.sessionToken) {
                existingByName.id = socket.id;
                addLog(io, gameState, `再接続: ${data.name} 復帰しました。`, 'system', undefined, room.spectatorIds, roomId);

                if (gameState.isGameStarted) {
                    socket.emit('role_assigned', {
                        isHacker: existingByName.isHacker,
                        isMurderer: existingByName.isMurderer,
                        roleName: existingByName.role,
                        secret: existingByName.secret,
                    });
                }

                socket.emit('join_success', { name: existingByName.name, token: existingByName.sessionToken });
                io.to(roomId).emit('state_update', gameState);
                broadcastRoomList();
                return;
            }
            socket.emit('error', 'このキャラクターは既に他のプレイヤーが選択しています。');
            return;
        }

        if (gameState.players.length >= 6) {
            socket.emit('error', 'このルームは満員です。');
            return;
        }

        const newToken = Math.random().toString(36).substring(2, 15);
        gameState.players.push(createDefaultPlayer(socket.id, data.name, data.role, newToken));
        addLog(io, gameState, `新規接続: ${data.name} 確立。`, 'system', undefined, room.spectatorIds, roomId);

        socket.emit('join_success', { name: data.name, token: newToken });

        if (gameState.players.length === 6 && !gameState.isGameStarted) {
            assignRoles(io, gameState, room.spectatorIds, roomId);
        }

        io.to(roomId).emit('state_update', gameState);
        broadcastRoomList();
    });

    // ----- GM観戦モード入室 (ルーム内) -----
    socket.on('join_spectator', () => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        room.spectatorIds.add(socket.id);
        socket.emit('spectator_confirmed');
        socket.emit('log_history', room.gameState.logs);

        if (room.gameState.isGameStarted) {
            const gmInfo = room.gameState.players.map(p => ({
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

    // ----- ルーム退室 / ゲーム離脱 -----
    socket.on('leave_room', () => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        socket.leave(roomId);
        (socket as any).roomId = null;

        if (room.spectatorIds.has(socket.id)) {
            room.spectatorIds.delete(socket.id);
        } else {
            const index = room.gameState.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const player = room.gameState.players[index];
                addLog(io, room.gameState, `退室: ${player.name} がロビーに戻りました。`, 'system', undefined, room.spectatorIds, roomId);
                room.gameState.players.splice(index, 1);
            }
        }

        // 全員退室したらルーム削除
        if (room.gameState.players.length === 0 && room.spectatorIds.size === 0) {
            console.log(`Deleting empty room: ${room.id}`);
            roomManager.deleteRoom(roomId);
        } else {
            io.to(roomId).emit('state_update', room.gameState);
        }

        broadcastRoomList();
        socket.emit('leave_room_success');
    });

    // ----- 設定変更 (ルーム内) -----
    socket.on('update_settings', (data: { turnDuration?: number }) => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room || room.gameState.isGameStarted) return;

        if (data.turnDuration !== undefined) {
            room.gameState.turnDuration = data.turnDuration;
            room.gameState.timeLeft = data.turnDuration;
            addLog(io, room.gameState, `システム設定変更: 1ターンの時間を ${data.turnDuration} 秒に設定しました。`, 'system', undefined, room.spectatorIds, roomId);
        }
        io.to(roomId).emit('state_update', room.gameState);
    });

    // ----- アクション (ルーム内) -----
    socket.on('action', (data: { type: string; cost: number; targetId?: string }) => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        const player = room.gameState.players.find(p => p.id === socket.id);
        if (!player) return;

        if (data.type === 'NULLIFY') {
            if (!player.isMurderer) { socket.emit('error', '殺人犯専用です。'); return; }
            if (player.nullifyUsedThisTurn) { socket.emit('error', '1ターン1回までです。'); return; }
            if (room.pendingActions.length === 0) { socket.emit('error', '無効化対象がありません。'); return; }

            player.nullifyUsedThisTurn = true;
            addLog(io, room.gameState, `パケット干渉検知。全アクション強制終了。`, 'critical', player.name, room.spectatorIds, roomId);

            room.pendingActions.forEach(pa => clearTimeout(pa.timerId));
            room.pendingActions = [];
            room.gameState.hasPendingActions = false;
            io.to(roomId).emit('state_update', room.gameState);
            return;
        }

        if (player.isIsolated) { socket.emit('error', '行動不能状態です。'); return; }
        const baseAp = 3;
        const limit = (player.isHacker || player.isMurderer) ? 6 : Math.max(3, 3 + (player.chargedAp || 0));
        const calculatedAp = Math.min(limit, Math.max(0, baseAp + (player.chargedAp || 0) - player.apDebuff));
        const ap = calculatedAp - (player.apSpentThisTurn || 0);

        if (ap < data.cost) { socket.emit('error', 'AP不足。'); return; }

        const isHackerAction = ['INJECT_MALWARE', 'EXFILTRATE', 'EXFIL', 'TAMPER_EVIDENCE', 'DDOS', 'FALSE_FLAG', 'SABOTAGE', 'LOCKOUT', 'BLACKOUT', 'PHYSICAL_DESTROY'].includes(data.type);
        const isMurdererAction = ['TAMPER_EVIDENCE', 'SABOTAGE', 'LOCKOUT', 'FALSE_FLAG', 'BLACKOUT', 'PHYSICAL_DESTROY'].includes(data.type);
        const publicCost = isHackerAction ? 0 : data.cost;
        const isUsingCopiedSkill = player.copiedSkill === data.type;

        if (isHackerAction && !player.isHacker && !(isMurdererAction && player.isMurderer) && !isUsingCopiedSkill) {
            socket.emit('error', 'ROOT権限が必要です。');
            return;
        }
        if (player.isIpBlocked) { socket.emit('error', 'IPブロック中。'); return; }

        // 回数制限
        if ((data.type === 'INJECT_MALWARE' || data.type === 'INJECT') && player.malwareUsedThisTurn >= 1) { socket.emit('error', '1ターン1回まで。'); return; }
        if ((data.type === 'EXFILTRATE' || data.type === 'EXFIL') && player.exfilUsedThisTurn >= 3) { socket.emit('error', '1ターン3回まで。'); return; }
        if (data.type === 'TRANSFER' && player.transferUsedThisTurn) { socket.emit('error', '1ターン1回まで。'); return; }
        if (data.type === 'DEPLOY_BOT' && player.deployBotUsedThisTurn >= 1) { socket.emit('error', '1ターン1回まで。'); return; }

        player.apSpentThisTurn += data.cost;
        room.gameState.totalPublicAp += publicCost;
        room.gameState.totalActualAp += data.cost;
        if (isHackerAction) player.performedHackerAction = true;
        if (isUsingCopiedSkill) { player.copiedSkill = null; player.copiedSkillLabel = null; }

        if (data.type === 'INJECT_MALWARE' || data.type === 'INJECT') player.malwareUsedThisTurn++;
        if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') player.exfilUsedThisTurn++;
        if (data.type === 'TRANSFER') player.transferUsedThisTurn = true;
        if (data.type === 'DEPLOY_BOT') player.deployBotUsedThisTurn++;
        if (data.type === 'ANALYZE_EVIDENCE') player.analyzedThisTurn = true;

        const newPendingAction = {
            playerId: player.id,
            playerName: player.name,
            socketId: socket.id,
            actionType: data.type,
            targetId: data.targetId,
            cost: data.cost,
            isHackerAction,
            publicCost,
            timerId: setTimeout(() => {
                room.pendingActions = executePendingAction(io, room.gameState, room.pendingActions, newPendingAction, room.spectatorIds, roomId);
            }, CHANT_DURATION),
        };

        room.pendingActions.push(newPendingAction);
        room.gameState.hasPendingActions = true;
        io.to(roomId).emit('state_update', room.gameState);
    });

    // ----- チャット (ルーム内) -----
    socket.on('chat_message', (data: { targetId: string; message: string; senderName: string }) => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room) return;

        const player = room.gameState.players.find(p => p.id === socket.id);
        const name = player ? player.name : data.senderName;
        addLog(io, room.gameState, 'ENCRYPTED COMMUNICATION.', 'warn', name, room.spectatorIds, roomId);
        io.to(data.targetId).emit('private_message', { senderId: socket.id, senderName: name, message: data.message });
    });

    // ----- 投票 (ルーム内) -----
    socket.on('vote', (data: { targetId: string }) => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room || !room.gameState.isGameStarted) return;

        const voter = room.gameState.players.find(p => p.id === socket.id);
        const target = room.gameState.players.find(p => p.id === data.targetId);
        if (voter && target) {
            const previousTargetId = room.gameState.votedPlayers[socket.id];
            if (previousTargetId) {
                const prevTarget = room.gameState.players.find(p => p.id === previousTargetId);
                if (prevTarget) prevTarget.votes = Math.max(0, prevTarget.votes - 1);
            }
            room.gameState.votedPlayers[socket.id] = data.targetId;
            target.votes++;
            addLog(io, room.gameState, 'ANONYMOUS VOTE RECORDED.', 'system', undefined, room.spectatorIds, roomId);
            io.to(roomId).emit('state_update', room.gameState);
        }
    });

    // ----- 投票取消 (ルーム内) -----
    socket.on('cancel_vote', () => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room || !room.gameState.isGameStarted) return;

        const previousTargetId = room.gameState.votedPlayers[socket.id];
        if (previousTargetId) {
            const prevTarget = room.gameState.players.find(p => p.id === previousTargetId);
            if (prevTarget) prevTarget.votes = Math.max(0, prevTarget.votes - 1);
            delete room.gameState.votedPlayers[socket.id];
            addLog(io, room.gameState, 'ANONYMOUS VOTE RETRACTED.', 'system', undefined, room.spectatorIds, roomId);
            io.to(roomId).emit('state_update', room.gameState);
        }
    });

    // ----- 最終投票 (ルーム内) -----
    socket.on('final_vote', (data: { murdererVote: string; hackerVote: string }) => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room || room.gameState.phase !== 'final_voting') return;

        room.gameState.finalVotesMurderer[socket.id] = data.murdererVote;
        room.gameState.finalVotesHacker[socket.id] = data.hackerVote;
        addLog(io, room.gameState, `FINAL IDENTIFICATION SUBMITTED.`, 'system', undefined, room.spectatorIds, roomId);
        io.to(roomId).emit('state_update', room.gameState);

        if (Object.keys(room.gameState.finalVotesMurderer).length >= room.gameState.players.length) {
            tallyFinalVotes(io, room.gameState, room.spectatorIds, roomId);
        }
    });

    // ----- 強制開始 / リセット (ルーム内) -----
    socket.on('start_game_force', () => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (room && room.gameState.players.length > 0) {
            assignRoles(io, room.gameState, room.spectatorIds, roomId);
            io.to(roomId).emit('state_update', room.gameState);
            broadcastRoomList();
        }
    });

    socket.on('reset_game', () => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (!room) return;
        const currentPlayers = room.gameState.players;
        room.gameState = { ...getInitialState(room.gameState.turnDuration), players: currentPlayers };
        addLog(io, room.gameState, 'SYSTEM REBOOT INITIATED.', 'system', undefined, room.spectatorIds, roomId);
        if (room.gameState.players.length === 6) assignRoles(io, room.gameState, room.spectatorIds, roomId);
        io.to(roomId).emit('state_update', room.gameState);
    });

    // ----- 切断 -----
    socket.on('disconnect', () => {
        const roomId = (socket as any).roomId;
        const room = roomManager.getRoom(roomId);
        if (room) {
            if (room.spectatorIds.has(socket.id)) {
                room.spectatorIds.delete(socket.id);
            } else {
                const player = room.gameState.players.find(p => p.id === socket.id);
                if (player) addLog(io, room.gameState, `CONNECTION SUSPENDED: ${player.name}`, 'warn', undefined, room.spectatorIds, roomId);
            }
            io.to(roomId).emit('state_update', room.gameState);
        }
        console.log('Client disconnected:', socket.id);
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
