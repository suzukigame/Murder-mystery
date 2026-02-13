import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 開発中は全許可
        methods: ["GET", "POST"]
    }
});

// ゲーム状態
let gameState = {
    hp: 100,
    leak: 0,
    turn: 1, // 1-8
    timeLeft: 60, // 秒 (デバッグ用: 1分)
    phase: 'discussion', // discussion, action, resolve
    isPaused: false,
    logs: [] as { id: string, time: string, level: string, content: string }[],
    players: [] as { id: string, name: string, role: string }[]
};

// ログ追加関数
const addLog = (content: string, level: 'info' | 'warn' | 'critical' | 'system' = 'info') => {
    const log = {
        id: Date.now().toString() + Math.random(),
        time: new Date().toLocaleTimeString(),
        level,
        content
    };
    gameState.logs.unshift(log);
    if (gameState.logs.length > 100) gameState.logs.pop();
    io.emit('log_update', log);
};

// 1秒ごとのタイマー処理
setInterval(() => {
    if (gameState.isPaused || gameState.turn > 8) return;

    gameState.timeLeft--;

    // デバッグログ (5秒ごと)
    if (gameState.timeLeft % 5 === 0) {
        console.log(`[DEBUG] Turn: ${gameState.turn}, Time: ${gameState.timeLeft}, Phase: ${gameState.phase}`);
    }

    // フェーズ遷移ロジック (簡易版: 60秒デバッグ)
    const elapsed = 60 - gameState.timeLeft;
    if (elapsed < 40) {
        if (gameState.phase !== 'discussion') {
            gameState.phase = 'discussion';
            io.emit('state_update', gameState);
        }
    } else if (elapsed < 50) {
        if (gameState.phase !== 'action') {
            gameState.phase = 'action';
            addLog('>>> ACTION PHASE STARTED. INPUT YOUR COMMANDS. <<<', 'system');
            io.emit('state_update', gameState);
        }
    } else {
        if (gameState.phase !== 'resolve') {
            gameState.phase = 'resolve';
            addLog('>>> RESOLVE PHASE. PROCESSING ALL ACTIONS... <<<', 'system');
            io.emit('state_update', gameState);
        }
    }

    // ターン終了
    if (gameState.timeLeft <= 0) {
        gameState.turn++;
        gameState.timeLeft = 60; // デバッグ用: 1分
        gameState.phase = 'discussion';
        addLog(`TURN ${gameState.turn - 1} COMPLETED. STARTING TURN ${gameState.turn}.`, 'system');
        io.emit('state_update', gameState);
    }
}, 1000); // 実時間進行 (デバッグ時はここを変更)

io.on('connection', (socket) => {
    console.log('--- NEW CLIENT CONNECTED ---', socket.id);

    // 初期状態送信
    socket.emit('state_update', gameState);
    socket.emit('log_history', gameState.logs);

    // 参加登録
    socket.on('join_game', (data: { name: string, role: string }) => {
        const existing = gameState.players.find(p => p.id === socket.id);
        if (!existing) {
            gameState.players.push({
                id: socket.id,
                name: data.name,
                role: data.role
            });
            addLog(`NEW CONNECTION: ${data.name} [${data.role}] ESTABLISHED.`, 'system');
            io.emit('state_update', gameState);
        } else {
            // 名前変更などの場合
            existing.name = data.name;
            existing.role = data.role;
            io.emit('state_update', gameState);
        }
    });

    // アクション受信
    socket.on('action', (data: { type: string, cost: number, effect?: any }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const executorName = player ? player.name : 'Unknown User';

        if (data.type === 'INJECT_MALWARE') {
            gameState.hp = Math.max(0, gameState.hp - 15);
            addLog(`CRITICAL ALERT: MALWARE DETECTED by ${executorName}. HP DROPPED.`, 'critical');
        } else if (data.type === 'SECURITY_PATCH') {
            gameState.hp = Math.min(100, gameState.hp + 10);
            addLog(`SYSTEM PATCH APPLIED by ${executorName}. HP RESTORED.`, 'info');
        } else if (data.type === 'EXFILTRATE') {
            gameState.leak = Math.min(100, gameState.leak + 20);
            addLog(`DATA EXFILTRATION DETECTED by ${executorName}.`, 'critical');
        } else if (data.type === 'NETWORK_SCAN') {
            addLog(`SYSTEM SCAN EXECUTED by ${executorName}. Result: Secure.`, 'info');
        } else if (data.type === 'VIEW_AUDIT_LOG') {
            addLog(`AUDIT LOG ACCESSED by ${executorName}. Monitoring active.`, 'info');
        }

        io.emit('state_update', gameState);
    });

    // チャット受信
    socket.on('chat_message', (data: { targetId: string, message: string, senderName: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const name = player ? player.name : data.senderName;
        addLog(`ENCRYPTED MESSAGE DETECTED FROM ${name}.`, 'warn');
    });

    socket.on('disconnect', () => {
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = gameState.players[playerIndex];
            gameState.players.splice(playerIndex, 1);
            addLog(`CONNECTION LOST: ${player.name}`, 'warn');
            io.emit('state_update', gameState);
        }
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
