import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

const app = express();
app.use(cors());

// フロントエンドのビルド成果物のパス
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

// ゲーム状態
// 定数
const TURN_DURATION = 15 * 60; // 15分

// ゲーム状態初期化関数
const getInitialState = () => ({
    hp: 100,
    leak: 0,
    turn: 1, // 1-8
    timeLeft: TURN_DURATION,
    phase: 'discussion', // discussion, action, resolve
    isPaused: false,
    logs: [] as { id: string, time: string, level: string, content: string }[],
    players: [] as { id: string, name: string, role: string, isHacker: boolean }[]
});

let gameState = getInitialState();

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

    // フェーズ遷移ロジック (15分対応)
    const elapsed = TURN_DURATION - gameState.timeLeft;
    const ACTION_START = 10 * 60;
    const RESOLVE_START = 14 * 60;

    if (elapsed < ACTION_START) {
        if (gameState.phase !== 'discussion') {
            gameState.phase = 'discussion';
            io.emit('state_update', gameState);
        }
    } else if (elapsed < RESOLVE_START) {
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
        gameState.timeLeft = TURN_DURATION;
        gameState.phase = 'discussion';
        addLog(`TURN ${gameState.turn - 1} COMPLETED. STARTING TURN ${gameState.turn}.`, 'system');
        io.emit('state_update', gameState);
    }

    // 毎秒の状態を全クライアントに通知 (タイマー同期のため)
    io.emit('state_update', gameState);
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
                role: data.role,
                isHacker: false // 初期値は偽。開始時に割り当てる
            });
            addLog(`NEW CONNECTION: ${data.name} [${data.role}] ESTABLISHED.`, 'system');

            // 6人揃ったら役割を割り当てる
            if (gameState.players.length === 6) {
                assignRoles();
            }

            io.emit('state_update', gameState);
        } else {
            // 名前変更などの場合
            existing.name = data.name;
            existing.role = data.role;
            io.emit('state_update', gameState);
        }
    });

    // 役割割り当て関数
    function assignRoles() {
        // 全プレイヤーのインデックスを取得してシャッフル
        const indices = gameState.players.map((_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        // 最初の2人をハッカーにする
        const hackerIndices = indices.slice(0, 2);
        gameState.players.forEach((p, i) => {
            p.isHacker = hackerIndices.includes(i);

            // 各プレイヤーに自分の役割を個別に通知
            io.to(p.id).emit('role_assigned', { isHacker: p.isHacker });
        });

        addLog('ROLES ASSIGNED. THE OPERATION BEGINS.', 'system');
    }

    // アクション受信
    socket.on('action', (data: { type: string, cost: number, targetId?: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player) return;

        const isHackerAction = ['INJECT_MALWARE', 'EXFILTRATE', 'COVER_TRACKS'].includes(data.type);
        const executorName = player.name;

        // 権限チェック: 非ハッカーがハッカーアクションをしようとした場合
        if (isHackerAction && !player.isHacker) {
            socket.emit('error', 'UNAUTHORIZED ACCESS: ROOT PRIVILEGES REQUIRED.');
            return;
        }

        // 基本アクション
        if (data.type === 'INJECT_MALWARE') {
            gameState.hp = Math.max(0, gameState.hp - 15);
            addLog(`CRITICAL ALERT: MALWARE DETECTED. SOURCE: [ENCRYPTED]. HP DROPPED.`, 'critical');
        } else if (data.type === 'SECURITY_PATCH' || data.type === 'RESTORE_SYSTEM') {
            gameState.hp = Math.min(100, gameState.hp + 10);
            addLog(`SYSTEM PATCH APPLIED by ${executorName}. HP RESTORED.`, 'info');
        } else if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') {
            gameState.leak = Math.min(100, gameState.leak + 20);
            addLog(`DATA EXFILTRATION DETECTED. ORIGIN: [UNKNOWN].`, 'critical');
        } else if (data.type === 'NETWORK_SCAN' || data.type === 'SECURITY_LOG_SCAN') {
            addLog(`SYSTEM SCAN EXECUTED by ${executorName}. Result: Secure.`, 'info');
        } else if (data.type === 'VIEW_AUDIT_LOG' || data.type === 'AUDIT') {
            addLog(`AUDIT LOG ACCESSED by ${executorName}. Monitoring active.`, 'info');
        } else if (data.type === 'ENCRYPT_DATA') {
            gameState.leak = Math.max(0, gameState.leak - 10);
            addLog(`DATA ENCRYPTION COMPLETE by ${executorName}. LEAK PROGRESS REDUCED.`, 'info');
        } else if (data.type === 'COVER_TRACKS') {
            addLog(`LOG PURGE DETECTED. SYSTEM TRACES REMOVED.`, 'warn');
        }
        // --- ユニークアクション (Special Skills) ---
        else if (data.type === 'TRAFFIC_TRACE' && player.role === 'Network Admin') {
            addLog(`TRAFFIC ANALYSIS REQUESTED by ${executorName}. Deep packet inspection active.`, 'info');
            // クライアント側で追加情報を表示するなどのフラグを立てることも可能
        } else if (data.type === 'MALWARE_SHIELD' && player.role === 'Security Analyst') {
            addLog(`DYNAMIC SHIELD DEPLOYED by ${executorName}. Integrity reinforced.`, 'info');
        } else if (data.type === 'DB_OPTIMIZE' && player.role === 'DB Engineer') {
            gameState.leak = Math.max(0, gameState.leak - 10);
            addLog(`DB OPTIMIZATION COMPLETE by ${executorName}. DATA EXPOSURE REDUCED.`, 'info');
        } else if (data.type === 'REBOOT_CORE' && player.role === 'Sys Operator') {
            gameState.hp = Math.min(100, gameState.hp + 15);
            addLog(`CORE SYSTEM REBOOT by ${executorName}. RESOURCES REALLOCATED.`, 'info');
        } else if (data.type === 'GRID_LOCK' && player.role === 'Infra Lead') {
            addLog(`GRID LOCK ACTIVATED by ${executorName}. SYSTEM STATE FROZEN.`, 'warn');
        } else if (data.type === 'AUTO_DOCKER' && player.role === 'Dev Ops') {
            addLog(`AUTO-SCALING INITIATED by ${executorName}. RESOURCE POOL EXPANDED.`, 'info');
        }

        io.emit('state_update', gameState);
    });

    // チャット受信
    socket.on('chat_message', (data: { targetId: string, message: string, senderName: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        const name = player ? player.name : data.senderName;

        // 全員へのログは匿名化
        addLog('ENCRYPTED COMMUNICATION DETECTED.', 'warn');

        // ターゲットにのみメッセージを送信
        io.to(data.targetId).emit('private_message', {
            senderId: socket.id,
            senderName: name,
            message: data.message
        });
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

    // ゲームリセット要求
    socket.on('reset_game', () => {
        const currentPlayers = gameState.players;
        gameState = getInitialState();
        gameState.players = currentPlayers; // プレイヤーリストは維持
        addLog('SYSTEM REBOOT INITIATED... NEW SESSION STARTED.', 'system');
        io.emit('state_update', gameState);
        io.emit('log_history', []);
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
