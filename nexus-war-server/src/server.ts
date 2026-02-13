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

const TURN_DURATION = 15 * 60; // 15分

// 型定義
type TurnPhase = 'discussion' | 'action' | 'resolve';

interface Player {
    id: string;
    name: string;
    role: string;
    isHacker: boolean;
    isMurderer: boolean; // 新: 殺人犯フラグ
    secret?: string;      // キャラクター固有の秘密
    isIsolated: boolean; // 投票により隔離されているか
    votes: number;       // 獲得票数
    performedHackerAction: boolean; // 前ターンにハッカー行動をしたか（TRACE_LOG用）
}

interface GameState {
    hp: number;
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
    firewallActive: boolean; // 新: Firewall状態
    votedPlayers: { [voterId: string]: string }; // 投票追跡
}

// ゲーム状態初期化関数
const getInitialState = (): GameState => ({
    hp: 100,
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
    votedPlayers: {}
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


            // 勝利判定チェック
            checkWinCondition();

            io.emit('state_update', gameState);
        }
    }

    // ターン終了
    if (gameState.timeLeft <= 0) {
        // DevOps Botの処理 (ターン終了時)
        if (gameState.devOpsBots > 0) {
            const botProgress = gameState.devOpsBots * 3;
            gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + botProgress);
            addLog(`AUTOMATED BOTS PROCESSED ANALYSIS: +${botProgress}%`, 'info');
            checkWinCondition();
        }

        // 投票集計と隔離
        let mostVotedPlayer: Player | null = null;
        let maxVotes = 0;
        gameState.players.forEach(p => {
            if (p.votes > maxVotes) {
                maxVotes = p.votes;
                mostVotedPlayer = p;
            }
        });

        if (mostVotedPlayer !== null && maxVotes > 0) {
            const victim = mostVotedPlayer as Player;
            victim.isIsolated = true;
            addLog(`VOTING RESULT: ${victim.name} HAS BEEN ISOLATED. NETWORK PRIVILEGES RESTRICTED.`, 'warn');
        }

        // AP不一致のログ出力
        const variance = gameState.totalActualAp - gameState.totalPublicAp;
        addLog(`[TURN REPORT] PUBLIC AP: ${gameState.totalPublicAp} | ACTUAL SYSTEM LOAD: ${gameState.totalActualAp}`, 'system');
        if (variance > 0) {
            addLog(`WARNING: ${variance} AP VARIANCE DETECTED. SUSPICIOUS BACKGROUND PROCESSES IDENTIFIED.`, 'critical');
        }

        // 次ターンの準備
        gameState.turn++;
        gameState.timeLeft = TURN_DURATION;
        gameState.phase = 'discussion';
        gameState.totalPublicAp = 0;
        gameState.totalActualAp = 0;
        gameState.firewallActive = false; // Firewallリセット
        gameState.votedPlayers = {}; // 投票リセット
        gameState.players.forEach(p => {
            p.votes = 0;
            p.performedHackerAction = false; // フラグリセット
            if (p.isIsolated && gameState.phase === 'discussion') {
                // 前ターンの隔離を解除（あるいは継続ルールにするか検討）
                // 一旦、隔離は1ターンのみとする
                setTimeout(() => { p.isIsolated = false; }, 100);
            }
        });

        addLog(`TURN ${gameState.turn - 1} COMPLETED. STARTING TURN ${gameState.turn}.`, 'system');
        io.emit('state_update', gameState);
    }

    // 毎秒の状態を全クライアントに通知 (タイマー同期のため)
    io.emit('state_update', gameState);
}, 1000); // 実時間進行 (デバッグ時はここを変更)

function checkWinCondition() {
    if (gameState.evidenceAnalysisProgress >= 100) {
        const murderer = gameState.players.find(p => p.isMurderer);
        const name = murderer ? murderer.name : "UNKNOWN";
        addLog(`!!! EVIDENCE ANALYSIS COMPLETE !!! MURDERER IDENTIFIED: ${name}`, 'critical');
        gameState.isPaused = true;
    }
    if (gameState.leak >= 100) {
        addLog(`!!! DATA LEAK 100% COMPLETE !!! HACKERS WIN. SYSTEM COMPROMISED.`, 'critical');
        gameState.isPaused = true;
    }
    if (gameState.hp <= 0) {
        addLog(`!!! SYSTEM FAILURE !!! HACKERS WIN. MAIN CORE DESTROYED.`, 'critical');
        gameState.isPaused = true;
    }
}

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
                isHacker: false,
                isMurderer: false,
                isIsolated: false,
                votes: 0,
                performedHackerAction: false
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

    // キャラクターごとの秘密情報の定義（ベーステキスト：役割通知時に上書きされる）
    const CHARACTER_SECRETS: { [key: string]: string } = {
        'Network Admin': 'マイニングの証拠',
        'Security Analyst': '偽造文書の件',
        'DB Engineer': 'データ売却未遂',
        'Sys Operator': 'ログ改ざんの件',
        'Infra Lead': '機密持ち出し未遂',
        'Dev Ops': 'バックドア設置'
    };

    // 役割割り当て関数
    function assignRoles() {
        const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);

        // ランダムに役職割り当て
        // 0番目: ハッカー
        // 1番目: 殺人犯
        // その他: 市民

        gameState.players.forEach(p => {
            p.isHacker = false;
            p.isMurderer = false;
            p.secret = "明日の朝、佐々木に不正を公表される予定だ。"; // デフォルト
        });

        // ハッカー割り当て
        const hacker = gameState.players.find(p => p.id === shuffled[0].id);
        if (hacker) {
            hacker.isHacker = true;
            hacker.secret = "あなたはハッカーとしてシステムに潜入した。佐々木の死は好機だ。";
        }

        // 殺人犯割り当て
        const murderer = gameState.players.find(p => p.id === shuffled[1].id);
        if (murderer) {
            murderer.isMurderer = true;
            murderer.secret = "あなたは18:00に佐々木を殺害した。証拠ファイルを解析されると終わりだ。";
        }

        gameState.players.forEach(p => {
            p.votes = 0;
            p.isIsolated = false;

            // 各プレイヤーに自分の役割と秘密を個別に通知
            let roleMsg = "一般市民";
            if (p.isHacker) roleMsg = "ハッカー";
            if (p.isMurderer) roleMsg = "殺人犯";

            io.to(p.id).emit('role_assigned', {
                isHacker: p.isHacker,
                isMurderer: p.isMurderer,
                roleName: p.role,
                secret: p.secret
            });
        });

        addLog('ROLES ASSIGNED. ONE MURDERER. ONE HACKER. FIND THE TRUTH.', 'system');
    }

    // アクション受信
    socket.on('action', (data: { type: string, cost: number, targetId?: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player) return;

        if (player.isIsolated) {
            socket.emit('error', 'ACCESS DENIED: ACCOUNT ISOLATED BY VOTE.');
            return;
        }

        const isHackerAction = ['INJECT_MALWARE', 'EXFILTRATE', 'COVER_TRACKS', 'TAMPER_EVIDENCE'].includes(data.type);
        const publicCost = isHackerAction ? 0 : data.cost; // ハッカーアクションは表向き0APに見える

        gameState.totalPublicAp += publicCost;
        gameState.totalActualAp += data.cost;

        if (isHackerAction) {
            player.performedHackerAction = true;
        }

        const executorName = player.name;

        // 権限チェック: 非ハッカーがハッカーアクションをしようとした場合
        // TAMPER_EVIDENCE は殺人犯用なので例外
        if (isHackerAction && !player.isHacker && data.type !== 'TAMPER_EVIDENCE') {
            socket.emit('error', 'UNAUTHORIZED ACCESS: ROOT PRIVILEGES REQUIRED.');
            return;
        }

        // 基本アクション
        if (data.type === 'INJECT_MALWARE') {
            if (gameState.firewallActive) {
                addLog(`MALWARE DETECTED BUT BLOCKED BY FIREWALL.`, 'info');
                gameState.firewallActive = false; // 消費
            } else {
                gameState.hp = Math.max(0, gameState.hp - 15);
                addLog(`CRITICAL ALERT: MALWARE DETECTED. SOURCE: [ENCRYPTED]. HP DROPPED.`, 'critical');
            }
        } else if (data.type === 'RESTORE_SYSTEM') {
            gameState.hp = Math.min(100, gameState.hp + 10);
            addLog(`SYSTEM PATCH APPLIED by ${executorName}. HP RESTORED.`, 'info');
        } else if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') {
            if (gameState.firewallActive) {
                addLog(`EXFILTRATION BLOCKED BY FIREWALL.`, 'info');
                gameState.firewallActive = false;
            } else {
                gameState.leak = Math.min(100, gameState.leak + 20);
                addLog(`DATA EXFILTRATION DETECTED. ORIGIN: [UNKNOWN].`, 'critical');
            }
        } else if (data.type === 'ANALYZE_EVIDENCE') {
            // 証拠解析
            // 殺人犯が実行しても進まない
            if (player.isMurderer) {
                addLog(`EVIDENCE ANALYSIS RUNNING... (Initiated by ${executorName})`, 'info');
                // No progress
            } else {
                gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + 10);
                addLog(`EVIDENCE ANALYSIS SUCCESSFUL (+10%) by ${executorName}.`, 'info');
            }
            checkWinCondition();
        } else if (data.type === 'ENCRYPT_DATA') {
            gameState.leak = Math.max(0, gameState.leak - 10);
            addLog(`DATA ENCRYPTION COMPLETE by ${executorName}. LEAK PROGRESS REDUCED.`, 'info');
        } else if (data.type === 'COVER_TRACKS') {
            addLog(`LOG PURGE DETECTED. SYSTEM TRACES REMOVED.`, 'warn');
        } else if (data.type === 'TAMPER_EVIDENCE') {
            // 殺人犯スキル: 証拠改ざん
            if (player.isMurderer) {
                gameState.evidenceAnalysisProgress = Math.max(0, gameState.evidenceAnalysisProgress - 15);
                addLog(`WARNING: DATA CORRUPTION DETECTED IN EVIDENCE LOGS.`, 'critical');
                player.performedHackerAction = true;
            } else {
                socket.emit('error', 'UNAUTHORIZED ACTION.');
            }
        }
        // --- ユニークアクション (Special Skills: Redeisgned) ---
        else if (data.type === 'TRACE_LOG' && player.role === 'Network Admin') {
            // 小林: 指定ターゲットの昨ターンのハッカー行動有無を調査
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                const result = target.performedHackerAction ? "POSITIVE (Suspicious Activity Found)" : "NEGATIVE (Clean)";
                // 個別通知
                io.to(player.id).emit('private_message', {
                    senderId: 'SYSTEM',
                    senderName: 'LogAnalyzer',
                    message: `TRACE RESULT for ${target.name}: ${result}`
                });
                addLog(`TRACE LOG EXECUTED on ${target.name} by ${executorName}. Result sent to admin.`, 'info');
            }
        } else if (data.type === 'FIREWALL' && player.role === 'Security Analyst') {
            // 田中: Firewall展開
            gameState.firewallActive = true;
            addLog(`FIREWALL DEPLOYED by ${executorName}. Next attack will be mitigated.`, 'info');
        } else if (data.type === 'DATA_RECOVERY' && player.role === 'DB Engineer') {
            // 鈴木: Leak回復
            gameState.leak = Math.max(0, gameState.leak - 15);
            addLog(`DATA RECOVERY COMPLETE by ${executorName}. LEAK REDUCED by 15%.`, 'info');
            checkWinCondition();
        } else if (data.type === 'SYS_ROLLBACK' && player.role === 'Sys Operator') {
            // 佐藤: HP大回復
            gameState.hp = Math.min(100, gameState.hp + 25);
            addLog(`SYSTEM ROLLBACK EXECUTED by ${executorName}. SYSTEM HP RESTORED (+25).`, 'info');
            checkWinCondition();
        } else if (data.type === 'SERVER_BOOST' && player.role === 'Infra Lead') {
            // 伊藤: 解析ブースト
            if (player.isMurderer) {
                addLog(`SERVER RESOURCE BOOSTED for ANALYSIS by ${executorName}.`, 'info');
            } else {
                gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + 15);
                addLog(`SERVER RESOURCE BOOSTED (+15% Analysis) by ${executorName}.`, 'info');
            }
            checkWinCondition();
        } else if (data.type === 'DEPLOY_BOT' && player.role === 'Dev Ops') {
            // 渡辺: Bot設置
            gameState.devOpsBots++;
            addLog(`AUTOMATED SECURITY BOT DEPLOYED by ${executorName}. Analysis throughput increased.`, 'info');
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

    // 投票受付（1ターン1票、変更可能）
    socket.on('vote', (data: { targetId: string }) => {
        const voter = gameState.players.find(p => p.id === socket.id);
        const target = gameState.players.find(p => p.id === data.targetId);

        if (voter && target && gameState.phase === 'discussion') {
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
