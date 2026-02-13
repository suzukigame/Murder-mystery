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

    // アクション受信
    socket.on('action', (data: { type: string, cost: number, effect?: any }) => {
        // ここで検証ロジックを入れる（AP足りてるかなど）
        // 今回は簡易的にそのまま反映
        if (data.type === 'INJECT_MALWARE') {
            gameState.hp = Math.max(0, gameState.hp - 15);
            addLog('CRITICAL ALERT: MALWARE DETECTED. HP DROPPED.', 'critical');
        } else if (data.type === 'SECURITY_PATCH') {
            gameState.hp = Math.min(100, gameState.hp + 10);
            addLog('SYSTEM PATCH APPLIED. HP RESTORED.', 'info');
        } else if (data.type === 'EXFILTRATE') {
            gameState.leak = Math.min(100, gameState.leak + 20);
            addLog('DATA EXFILTRATION DETECTED.', 'critical');
        } else if (data.type === 'NETWORK_SCAN') {
            // 本来は個別に送るべきだが、デモ用に全体ログ＆自分用ログ
            // 自分用ログを送る手段がまだないので、一旦全体ログに「スキャン実行」と出す
            addLog(`SYSTEM SCAN EXECUTED by User. Result: Secure.`, 'info');
        } else if (data.type === 'VIEW_AUDIT_LOG') {
            addLog(`AUDIT LOG ACCESSED. Monitoring active.`, 'info');
        }

        io.emit('state_update', gameState);
    });

    // チャット受信
    socket.on('chat_message', (data: { targetId: string, message: string, senderName: string }) => {
        // 特定の相手に送る処理 (Socket.io roomなどを使用)
        // 今回はログに「暗号化通信」として出すのみ（実際の中身は送らない）
        addLog(`ENCRYPTED MESSAGE DETECTED FROM ${data.senderName}.`, 'warn');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
