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
            const botProgress = gameState.devOpsBots * 3;
            gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + botProgress);
            addLog(`自動セキュリティBOTによる解析処理: +${botProgress}%`, 'info');
            checkWinCondition();
        }

        // 投票集計の前に、前ターンの隔離を解除
        gameState.players.forEach(p => {
            p.isIsolated = false;
        });

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
            addLog(`投票結果: ${victim.name} が隔離されました。ネットワーク権限が制限されます。`, 'warn');
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
                    addLog(`ネットワーク遅延: ${p.name} のリソースが制限されました (-${p.apDebuff} AP)。`, 'warn');
                    // クライアント側にデバフ情報を送信
                    io.to(p.id).emit('ap_debuff', { amount: p.apDebuff });
                    p.apDebuff = 0; // デバフをリセット
                }
            });

            addLog(`ターン ${gameState.turn - 1} 終了。ターン ${gameState.turn} を開始します。`, 'system');
            io.emit('state_update', gameState);
        }
    }

}, 1000); // 実時間進行 (デバッグ時はここを変更)

function checkWinCondition() {
    if (gameState.evidenceAnalysisProgress >= 100) {
        const murderer = gameState.players.find(p => p.isMurderer);
        const name = murderer ? murderer.name : "UNKNOWN";
        addLog(`!!! 証拠解析コンプリート !!! 殺人犯を特定: ${name}`, 'critical');
        gameState.isPaused = true;
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
    socket.on('join_game', (data: { name: string, role: string }) => {
        // 名前で既存プレイヤーを検索 (再接続対応)
        const existingByName = gameState.players.find(p => p.name === data.name);

        if (existingByName) {
            // IDを最新のものに更新
            existingByName.id = socket.id;
            addLog(`再接続: ${data.name} [${existingByName.role}] 復帰しました。`, 'system');

            // 役割がある場合は個別に再通知
            if (gameState.isGameStarted) {
                socket.emit('role_assigned', {
                    isHacker: existingByName.isHacker,
                    isMurderer: existingByName.isMurderer,
                    roleName: existingByName.role,
                    secret: existingByName.secret
                });
            }

            // 【重要】再接続であっても、6人揃っていて未開始なら開始する
            if (gameState.players.length === 6 && !gameState.isGameStarted) {
                assignRoles();
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
            addLog(`新規接続: ${data.name} [${data.role}] 確立。`, 'system');

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

    // GM観戦モードで参加
    socket.on('join_spectator', () => {
        spectatorIds.add(socket.id);
        addLog('GM観戦モード: 接続しました。', 'system');
        socket.emit('spectator_confirmed', true);
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

        gameState.players.forEach(p => {
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

        if (player.isIsolated) {
            socket.emit('error', 'アクセス拒否: 投票により隔離されています。');
            return;
        }

        const isHackerAction = ['INJECT_MALWARE', 'EXFILTRATE', 'COVER_TRACKS', 'TAMPER_EVIDENCE', 'DDOS', 'FALSE_FLAG', 'SABOTAGE', 'LOCKOUT'].includes(data.type);
        const isMurdererAction = ['TAMPER_EVIDENCE', 'SABOTAGE', 'LOCKOUT', 'FALSE_FLAG'].includes(data.type);
        const publicCost = isHackerAction ? 0 : data.cost; // ハッカー/マーダーアクションは表向き0APに見える

        gameState.totalPublicAp += publicCost;
        gameState.totalActualAp += data.cost;

        if (isHackerAction) {
            player.performedHackerAction = true;
        }

        const executorName = player.name;

        // 権限チェック: 非ハッカーがハッカーアクションをしようとした場合
        // 殺人犯アクション (TAMPER_EVIDENCE, SABOTAGE, LOCKOUT, FALSE_FLAG) は殺人犯に許可
        if (isHackerAction && !player.isHacker && !(isMurdererAction && player.isMurderer)) {
            socket.emit('error', '不正アクセス: ROOT権限が必要です。');
            return;
        }

        // 基本アクション
        if (data.type === 'INJECT_MALWARE') {
            gameState.currentTurnAttackActions++;
            if (gameState.firewallActive) {
                addLog(`マルウェア検知。ファイアウォールによりブロックされました。`, 'info', executorName);
                gameState.firewallActive = false; // 消費
            } else {
                gameState.hp = Math.max(0, gameState.hp - 40); // バランス調整: 15 -> 40
                addLog(`緊急警報: マルウェア検知。送信元: [暗号化済]。システムHP低下。`, 'critical', executorName);
            }
        } else if (data.type === 'RESTORE_SYSTEM') {
            gameState.hp = Math.min(100, gameState.hp + 10);
            addLog(`システムパッチ適用。HP回復。`, 'info', executorName);
        } else if (data.type === 'EXFILTRATE' || data.type === 'EXFIL') {
            gameState.currentTurnAttackActions++;
            if (gameState.firewallActive) {
                addLog(`データ持ち出し阻止。ファイアウォール作動。`, 'info', executorName);
                gameState.firewallActive = false;
            } else {
                gameState.leak = Math.min(100, gameState.leak + 15); // バランス調整: 20 -> 15
                addLog(`データ持ち出し検知。送信元: [不明]。`, 'critical', executorName);
            }
        } else if (data.type === 'ANALYZE_EVIDENCE') {
            // 証拠解析
            if (!player.isMurderer) {
                gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + 10);
            }
            addLog(`証拠解析完了 (+10%)。`, 'info', executorName);
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
            addLog(`ログ消去を検知。システム痕跡が削除されました。`, 'warn', executorName);
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
                    target.performedHackerAction = true;
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
            } else {
                socket.emit('error', '不正なアクションです。');
            }
        }
        // --- ユニークアクション (Special Skills: Redeisgned) ---
        else if (data.type === 'TRACE_LOG' && player.role === 'ネットワーク管理者') {
            // 小林: 指定ターゲットの昨ターンのハッカー行動有無を調査
            const target = gameState.players.find(p => p.id === data.targetId);
            if (target) {
                const result = (target.lastTurnHackerAction || target.performedHackerAction) ? "POSITIVE (不審な活動を確認)" : "NEGATIVE (異常なし)";
                // 個別通知
                io.to(player.id).emit('private_message', {
                    senderId: 'SYSTEM',
                    senderName: 'LogAnalyzer',
                    message: `${target.name} の追跡結果: ${result}`
                });
                addLog(`${target.name} に対するログ追跡を実行。結果は管理者に通知されました。`, 'info', executorName);
            }
        } else if (data.type === 'FIREWALL' && player.role === 'セキュリティ分析官') {
            // 田中: Firewall展開
            gameState.firewallActive = true;
            addLog(`ファイアウォール展開。次の攻撃を無効化します。`, 'info', executorName);
        } else if (data.type === 'DATA_RECOVERY' && player.role === 'DBエンジニア') {
            // 鈴木: Leak回復
            gameState.leak = Math.max(0, gameState.leak - 15);
            addLog(`データ復旧完了。漏洩率が15%低下しました。`, 'info', executorName);
            checkWinCondition();
        } else if (data.type === 'SYS_ROLLBACK' && player.role === 'システムオペレーター') {
            // 佐藤: HP大回復
            gameState.hp = Math.min(100, gameState.hp + 25);
            addLog(`システムロールバック実行。システムHP大回復 (+25)。`, 'info', executorName);
            checkWinCondition();
        } else if (data.type === 'SERVER_BOOST' && player.role === 'インフラリーダー') {
            // 伊藤: 解析ブースト
            if (!player.isMurderer) {
                gameState.evidenceAnalysisProgress = Math.min(100, gameState.evidenceAnalysisProgress + 15);
            }
            addLog(`サーバリソースブースト。解析効率向上 (+15%)。`, 'info', executorName);
            checkWinCondition();
        } else if (data.type === 'DEPLOY_BOT' && player.role === 'DevOps') {
            // 渡辺: Bot設置 (最大3台まで)
            if (gameState.devOpsBots >= 3) {
                socket.emit('error', '配備失敗: BOT最大数(3)に達しています。');
            } else {
                gameState.devOpsBots++;
                addLog(`自動セキュリティBOT配備完了。解析スループット向上。`, 'info', executorName);
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
        gameState = getInitialState();
        gameState.players = currentPlayers; // プレイヤーリストは維持
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
