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

// CONSTANTS FOR DEVELOPMENT (3 min turns)
const TURN_DURATION = 3 * 60; // 3分 (開発用)
// const TURN_DURATION = 10 * 60; // 10分 (本番用)

// 型定義
type TurnPhase = 'discussion' | 'action' | 'resolve' | 'final_voting';

interface Player {
    id: string;
    name: string;
    role: string;
    isHacker: boolean;
    isMurderer: boolean; // 新: 殺人犯フラグ
    secret?: string;      // キャラクター固有の秘密
    isIsolated: boolean; // 投票により隔離されているか
    votes: number;       // 獲得票数
    performedHackerAction: boolean; // 現在のターンにハッカー行動をしたか
    lastTurnHackerAction: boolean;  // 新: 昨ターンのハッカー行動（TRACE_LOG用）
    apDebuff: number;    // 新: 次ターンのAPデバフ（DDOS用）
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
    votedPlayers: { [voterId: string]: string }; // 新: 投票履歴
    currentTurnAttackActions: number; // 現在のターンの攻撃的行動数 (Intrusion)
    currentTurnManipActions: number;   // 現在のターンの工作型行動数 (Manipulation)
    previousTurnAttackActions: number; // 前のターンの攻撃的行動数
    previousTurnManipActions: number;  // 前のターンの工作型行動数
    isGameStarted: boolean;            // 新: ゲーム開始フラグ (役割割り当て済みか)
    // 最終投票フェーズ用
    finalVotesMurderer: { [voterId: string]: string }; // 殺人犯への投票
    finalVotesHacker: { [voterId: string]: string };   // ハッカーへの投票
    finalVotingComplete: boolean;                       // 最終投票完了フラグ
    finalVotingResult: 'none' | 'employee_perfect_win' | 'employee_win' | 'murderer_escape'; // 最終投票結果
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
    votedPlayers: {},
    currentTurnAttackActions: 0,
    currentTurnManipActions: 0,
    previousTurnAttackActions: 0,
    previousTurnManipActions: 0,
    isGameStarted: false,
    finalVotesMurderer: {},
    finalVotesHacker: {},
    finalVotingComplete: false,
    finalVotingResult: 'none'
});

let gameState = getInitialState();

// ログ追加関数
const addLog = (content: string, level: 'info' | 'warn' | 'critical' | 'system' = 'info') => {
    const log = {
        id: Date.now().toString() + Math.random(),
        time: new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }),
        level,
        content
    };
    gameState.logs.unshift(log);
    if (gameState.logs.length > 100) gameState.logs.pop();
    io.emit('log_update', log);
};

// 1秒ごとのタイマー処理
setInterval(() => {
    // 状態送信は常に継続（ハートビート）
    io.emit('state_update', gameState);

    if (gameState.isPaused || gameState.turn > 8 || gameState.phase === 'final_voting') return;

    gameState.timeLeft--;

    // デバッグログ (5秒ごと)
    if (gameState.timeLeft % 5 === 0) {
        console.log(`[DEBUG] Turn: ${gameState.turn}, Time: ${gameState.timeLeft}, Phase: ${gameState.phase}`);
    }



    // ...

    // フェーズ遷移ロジック
    const elapsed = TURN_DURATION - gameState.timeLeft;

    // 開発用 (3分): Discussion 2分 -> Action 40秒 -> Resolve 20秒
    const ACTION_START = 2 * 60;   // 2分経過でアクション開始 (残1分)
    const RESOLVE_START = 2 * 60 + 40; // 2分40秒経過で解決開始 (残20秒)

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

        // 投票集計の前に、前ターンの隔離を解除
        gameState.players.forEach(p => {
            p.isIsolated = false;
        });

        // 投票集計と隔離
        // 投票集計と隔離
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
            victim.isIsolated = true;
            addLog(`VOTING RESULT: ${victim.name} HAS BEEN ISOLATED. NETWORK PRIVILEGES RESTRICTED.`, 'warn');
        } else if (candidates.length > 1) {
            addLog(`VOTING RESULT: TIE DETECTED (${maxVotes} votes). NO ACTION TAKEN.`, 'info');
        }

        // AP不一致のログ出力
        const variance = gameState.totalActualAp - gameState.totalPublicAp;
        addLog(`[TURN REPORT] PUBLIC AP: ${gameState.totalPublicAp} | ACTUAL SYSTEM LOAD: ${gameState.totalActualAp}`, 'system');
        if (variance > 0) {
            addLog(`WARNING: ${variance} AP VARIANCE DETECTED. SUSPICIOUS BACKGROUND PROCESSES IDENTIFIED.`, 'critical');
        }

        // Turn 8 終了時 → 最終投票フェーズへ
        if (gameState.turn >= 8) {
            gameState.phase = 'final_voting';
            gameState.timeLeft = 0;
            gameState.finalVotesMurderer = {};
            gameState.finalVotesHacker = {};
            gameState.finalVotingComplete = false;
            gameState.finalVotingResult = 'none';
            addLog('>>> ALL 8 TURNS COMPLETED. FINAL VOTING PHASE: IDENTIFY THE MURDERER AND HACKER. <<<', 'system');
            io.emit('state_update', gameState);
        } else {
            // 次ターンの準備
            gameState.previousTurnAttackActions = gameState.currentTurnAttackActions;
            gameState.previousTurnManipActions = gameState.currentTurnManipActions;
            gameState.currentTurnAttackActions = 0;
            gameState.currentTurnManipActions = 0;
            gameState.turn++;
            gameState.timeLeft = TURN_DURATION;
            gameState.phase = 'discussion';
            gameState.totalPublicAp = 0;
            gameState.totalActualAp = 0;
            gameState.firewallActive = false; // Firewallリセット
            gameState.votedPlayers = {}; // 投票履歴リセット
            gameState.players.forEach(p => {
                p.votes = 0;
                p.lastTurnHackerAction = p.performedHackerAction; // 現在の行動を前回として保存
                p.performedHackerAction = false; // フラグリセット
                // DDOSデバフの適用と通知
                if (p.apDebuff > 0) {
                    addLog(`NETWORK DEGRADATION: ${p.name}'s resources throttled (-${p.apDebuff} AP).`, 'warn');
                    // クライアント側にデバフ情報を送信
                    io.to(p.id).emit('ap_debuff', { amount: p.apDebuff });
                    p.apDebuff = 0; // デバフをリセット
                }
            });

            addLog(`TURN ${gameState.turn - 1} COMPLETED. STARTING TURN ${gameState.turn}.`, 'system');
            io.emit('state_update', gameState);
        }
    }

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

    addLog(`=== FINAL VOTE RESULTS ===`, 'system');
    addLog(`MURDERER SUSPECT: ${murdererGuessName} (${maxMurdererVotes} votes) → ${murdererCorrect ? 'CORRECT ✓' : 'WRONG ✗'}`, 'system');
    addLog(`HACKER SUSPECT: ${hackerGuessName} (${maxHackerVotes} votes) → ${hackerCorrect ? 'CORRECT ✓' : 'WRONG ✗'}`, 'system');
    addLog(`REAL MURDERER: ${realMurderer?.name || 'UNKNOWN'}`, 'system');
    addLog(`REAL HACKER: ${realHacker?.name || 'UNKNOWN'}`, 'system');

    if (murdererCorrect && hackerCorrect) {
        gameState.finalVotingResult = 'employee_perfect_win';
        addLog(`★★★ PERFECT VICTORY ★★★ Both traitors identified!`, 'critical');
    } else if (murdererCorrect) {
        gameState.finalVotingResult = 'employee_win';
        addLog(`★ EMPLOYEES WIN ★ Murderer identified! Hacker remains at large.`, 'critical');
    } else {
        gameState.finalVotingResult = 'murderer_escape';
        addLog(`✗ MURDERER ESCAPES ✗ The killer walks free...`, 'critical');
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
    socket.on('join_game', (data: { name: string, role: string }) => {
        // 名前で既存プレイヤーを検索 (再接続対応)
        const existingByName = gameState.players.find(p => p.name === data.name);

        if (existingByName) {
            // IDを最新のものに更新
            existingByName.id = socket.id;
            addLog(`RECONNECTED: ${data.name} [${existingByName.role}] RE-ESTABLISHED.`, 'system');

            // 役割がある場合は個別に再通知
            if (gameState.isGameStarted) {
                socket.emit('role_assigned', {
                    isHacker: existingByName.isHacker,
                    isMurderer: existingByName.isMurderer,
                    roleName: existingByName.role,
                    secret: existingByName.secret
                });
            }
            io.emit('state_update', gameState);
            return;
        }

        const existingById = gameState.players.find(p => p.id === socket.id);
        if (!existingById) {
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
                apDebuff: 0
            });
            addLog(`NEW CONNECTION: ${data.name} [${data.role}] ESTABLISHED.`, 'system');

            // 6人揃っていて、かつ未開始なら役割を割り当てる
            if (gameState.players.length === 6 && !gameState.isGameStarted) {
                assignRoles();
            }

            io.emit('state_update', gameState);
        } else {
            // 名前変更などの場合
            existingById.name = data.name;
            existingById.role = data.role;
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
        // すでに開始している場合は重複を防ぐ
        if (gameState.isGameStarted) return;

        const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);

        // ランダムに役職割り当て
        // 0番目: ハッカー
        // 1番目: 殺人犯
        // その他: 社員

        gameState.players.forEach(p => {
            p.isHacker = false;
            p.isMurderer = false;
            p.secret = "明日の朝、鈴木に不正を公表される予定だ。"; // デフォルト
        });

        // ハッカー割り当て
        const hacker = gameState.players.find(p => p.id === shuffled[0].id);
        if (hacker) {
            hacker.isHacker = true;
            hacker.secret = "あなたはハッカーとしてシステムに潜入した。鈴木の死は好機だ。";
        }

        // 殺人犯割り当て
        const murderer = gameState.players.find(p => p.id === shuffled[1].id);
        if (murderer) {
            murderer.isMurderer = true;
            murderer.secret = "あなたは18:00に鈴木を殺害した。証拠ファイルを解析されると終わりだ。";
        }

        gameState.isGameStarted = true; // 開始フラグを立てる

        gameState.players.forEach(p => {
            p.votes = 0;
            p.isIsolated = false;

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

        addLog('ROLES ASSIGNED. ONE MURDERER. ONE HACKER. FIND THE TRUTH.', 'system');
    }
    socket.on('action', (data: { type: string, cost: number, targetId?: string }) => {
        const player = gameState.players.find(p => p.id === socket.id);
        if (!player) return;

        if (player.isIsolated) {
            socket.emit('error', 'ACCESS DENIED: ACCOUNT ISOLATED BY VOTE.');
            return;
        }

        const isHackerAction = ['INJECT_MALWARE', 'EXFILTRATE', 'COVER_TRACKS', 'TAMPER_EVIDENCE', 'DDOS', 'FALSE_FLAG'].includes(data.type);
        const publicCost = isHackerAction ? 0 : data.cost; // ハッカーアクションは表向き0APに見える

        gameState.totalPublicAp += publicCost;
        gameState.totalActualAp += data.cost;

        if (isHackerAction) {
            player.performedHackerAction = true;
        }

        const executorName = player.name;

        // 権限チェック: 非ハッカーがハッカーアクションをしようとした場合
        // TAMPER_EVIDENCE は殺人犯用（ハッカーとは限らない）だが、隠密行動扱いにする
        if (isHackerAction && !player.isHacker && data.type !== 'TAMPER_EVIDENCE') {
            socket.emit('error', 'UNAUTHORIZED ACCESS: ROOT PRIVILEGES REQUIRED.');
            return;
        }

        // 基本アクション
        if (data.type === 'INJECT_MALWARE') {
            gameState.currentTurnAttackActions++;
            if (gameState.firewallActive) {
                addLog(`MALWARE DETECTED BUT BLOCKED BY FIREWALL.`, 'info');
                gameState.firewallActive = false; // 消費
            } else {
                gameState.hp = Math.max(0, gameState.hp - 15); // シナリオ通り 15
                addLog(`CRITICAL ALERT: MALWARE DETECTED. SOURCE: [ENCRYPTED]. HP DROPPED.`, 'critical');
            }
        } else if (data.type === 'RESTORE_SYSTEM') {
            gameState.hp = Math.min(100, gameState.hp + 10);
            addLog(`SYSTEM PATCH APPLIED. HP RESTORED.`, 'info');
        } else if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') {
            gameState.currentTurnAttackActions++;
            if (gameState.firewallActive) {
                addLog(`EXFILTRATION BLOCKED BY FIREWALL.`, 'info');
                gameState.firewallActive = false;
            } else {
                gameState.leak = Math.min(100, gameState.leak + 20); // シナリオ通り 20
                addLog(`DATA EXFILTRATION DETECTED. ORIGIN: [UNKNOWN].`, 'critical');
            }
        } else if (data.type === 'ANALYZE_EVIDENCE') {
            // 証拠解析
            if (!player.isMurderer) {
                gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + 10);
            }
            addLog(`EVIDENCE ANALYSIS SUCCESSFUL (+10%).`, 'info');
            checkWinCondition();
        } else if (data.type === 'ENCRYPT_DATA') {
            gameState.leak = Math.max(0, gameState.leak - 10);
            addLog(`DATA ENCRYPTION COMPLETE. LEAK PROGRESS REDUCED.`, 'info');
        } else if (data.type === 'VIEW_AUDIT_LOG') {
            const total = gameState.previousTurnAttackActions + gameState.previousTurnManipActions;
            // 実行者にのみ詳細を通知
            io.to(socket.id).emit('private_message', {
                senderId: 'SYSTEM',
                senderName: 'AuditScanner',
                message: `[AUDIT REPORT] PREVIOUS CYCLE DETECTED: ${total} unauthorized tasks. (INTRUSION: ${gameState.previousTurnAttackActions}, MANIPULATION: ${gameState.previousTurnManipActions})`
            });
            // 実行された事実のみ公表
            addLog(`${executorName} EXECUTED SYSTEM AUDIT. RESULTS RESTRICTED TO AGENT.`, 'info');
        } else if (data.type === 'COVER_TRACKS') {
            gameState.currentTurnManipActions++;
            player.performedHackerAction = false;
            addLog(`LOG PURGE DETECTED. SYSTEM TRACES REMOVED.`, 'warn');
        } else if (data.type === 'DDOS') {
            gameState.currentTurnAttackActions++;
            // ハッカースキル: DDOS攻撃（ターゲットの次ターンAPを-1）
            if (player.isHacker) {
                const target = gameState.players.find(p => p.id === data.targetId);
                if (target) {
                    target.apDebuff = Math.min(target.apDebuff + 1, 2); // 最大-2まで
                    addLog(`WARNING: ABNORMAL RESOURCE CONSUMPTION DETECTED ON NETWORK.`, 'critical');
                    // ターゲットには個人通知
                    io.to(target.id).emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'SystemAlert',
                        message: `YOUR TERMINAL HAS BEEN TARGETED BY DDOS. NEXT TURN AP -1.`
                    });
                }
            } else {
                socket.emit('error', 'UNAUTHORIZED ACCESS: ROOT PRIVILEGES REQUIRED.');
            }
        } else if (data.type === 'FALSE_FLAG') {
            gameState.currentTurnManipActions++;
            // ハッカースキル: 証拠偽装（ターゲットのTRACE_LOG結果をPOSITIVEに偽装）
            if (player.isHacker) {
                const target = gameState.players.find(p => p.id === data.targetId);
                if (target) {
                    target.performedHackerAction = true;
                    // ハッカー本人にだけ通知
                    io.to(player.id).emit('private_message', {
                        senderId: 'SYSTEM',
                        senderName: 'HackerOS',
                        message: `FALSE FLAG PLANTED ON ${target.name}. TRACE_LOG WILL SHOW POSITIVE.`
                    });
                }
            } else {
                socket.emit('error', 'UNAUTHORIZED ACCESS: ROOT PRIVILEGES REQUIRED.');
            }
        } else if (data.type === 'TAMPER_EVIDENCE') {
            gameState.currentTurnManipActions++;
            // 殺人犯スキル: 証拠改ざん
            if (player.isMurderer) {
                // 解析を後退させる
                gameState.evidenceAnalysisProgress = Math.max(0, gameState.evidenceAnalysisProgress - 15);
                addLog(`WARNING: DATA CORRUPTION DETECTED IN EVIDENCE LOGS.`, 'critical');
                // 殺人犯も痕跡を残す（TRACE_LOGでバレるようにする）
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
                const result = (target.lastTurnHackerAction || target.performedHackerAction) ? "POSITIVE (Suspicious Activity Found)" : "NEGATIVE (Clean)";
                // 個別通知
                io.to(player.id).emit('private_message', {
                    senderId: 'SYSTEM',
                    senderName: 'LogAnalyzer',
                    message: `TRACE RESULT for ${target.name}: ${result}`
                });
                addLog(`TRACE LOG EXECUTED on ${target.name}. Result sent to admin.`, 'info');
            }
        } else if (data.type === 'FIREWALL' && player.role === 'Security Analyst') {
            // 田中: Firewall展開
            gameState.firewallActive = true;
            addLog(`FIREWALL DEPLOYED. Next attack will be mitigated.`, 'info');
        } else if (data.type === 'DATA_RECOVERY' && player.role === 'DB Engineer') {
            // 鈴木: Leak回復
            gameState.leak = Math.max(0, gameState.leak - 15);
            addLog(`DATA RECOVERY COMPLETE. LEAK REDUCED by 15%.`, 'info');
            checkWinCondition();
        } else if (data.type === 'SYS_ROLLBACK' && player.role === 'Sys Operator') {
            // 佐藤: HP大回復
            gameState.hp = Math.min(100, gameState.hp + 25);
            addLog(`SYSTEM ROLLBACK EXECUTED. SYSTEM HP RESTORED (+25).`, 'info');
            checkWinCondition();
        } else if (data.type === 'SERVER_BOOST' && player.role === 'Infra Lead') {
            // 伊藤: 解析ブースト
            if (!player.isMurderer) {
                gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + 15);
            }
            addLog(`SERVER RESOURCE BOOSTED (+15% Analysis).`, 'info');
            checkWinCondition();
        } else if (data.type === 'DEPLOY_BOT' && player.role === 'Dev Ops') {
            // 渡辺: Bot設置 (最大3台まで)
            if (gameState.devOpsBots >= 3) {
                socket.emit('error', 'DEPLOYMENT FAILED: MAXIMUM BOT CAPACITY (3) REACHED.');
            } else {
                gameState.devOpsBots++;
                addLog(`AUTOMATED SECURITY BOT DEPLOYED. Analysis throughput increased.`, 'info');
            }
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
