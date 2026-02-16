import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { Terminal, Shield, AlertTriangle, Zap, Cpu, Eye, Skull, Lock, X, Database, Search, RotateCcw, Trophy, User } from 'lucide-react';
import io from 'socket.io-client';

// ソケット接続 (開発環境用URL)
// ソケット接続 (本番環境では相対パス、開発環境では localhost:3000)
const socket = io(import.meta.env.MODE === 'production' ? '/' : 'http://localhost:3000');

// --- 型定義 ---
interface LogEntry {
    id: string;
    time: string;
    level: 'info' | 'warn' | 'critical' | 'system';
    content: string;
}

type TurnPhase = 'discussion' | 'action' | 'resolve' | 'final_voting';
type GameResult = 'playing' | 'hacker_win_hp' | 'hacker_win_leak' | 'defense_win' | 'murderer_found' | 'employee_perfect_win' | 'employee_win' | 'murderer_escape';

// プレイヤー定義（デモ用）
const PLAYERS = [
    { id: 'p1', name: '一文字' },
    { id: 'p2', name: '二瓶' },
    { id: 'p3', name: '三和' },
    { id: 'p4', name: '四宮' },
    { id: 'p5', name: '五香' },
    { id: 'p6', name: '六角' },
];

function App() {
    // --- ゲーム状態 (サーバー同期) ---
    const [ap, setAp] = useState(3);
    const [turn, setTurn] = useState<number>(1);
    const [timeLeft, setTimeLeft] = useState(3 * 60); // 開発用 3分
    // const [timeLeft, setTimeLeft] = useState(10 * 60); // 本番用 10分
    const [phase, setPhase] = useState<TurnPhase>('discussion');
    const [systemHp, setSystemHp] = useState(100);
    const [dataLeak, setDataLeak] = useState(0);
    const [evidenceAnalysis, setEvidenceAnalysis] = useState(0); // 証拠解析率
    const [gameResult, setGameResult] = useState<GameResult>('playing');
    const [nextTurnDebuff, setNextTurnDebuff] = useState(0); // 次ターンのデバフ一時保存
    const [chargedAp, setChargedAp] = useState(0); // チャージAP（ハッカー/殺人犯専用）

    // --- UI状態 (ローカル) ---
    const [isJoined, setIsJoined] = useState(false);
    const [myPlayerName, setMyPlayerName] = useState('');
    const [myRole, setMyRole] = useState('');
    const [mySecret, setMySecret] = useState('');
    const [isHacker, setIsHacker] = useState(false);
    const [isMurderer, setIsMurderer] = useState(false); // 新: 殺人犯フラグ
    const [isIsolated, setIsIsolated] = useState(false);
    const [players, setPlayers] = useState<any[]>([]);
    const [isTraceMode, setIsTraceMode] = useState(false); // Trace mode state
    const [isDdosMode, setIsDdosMode] = useState(false); // DDOS target selection mode
    const [isFalseFlagMode, setIsFalseFlagMode] = useState(false); // False flag targeting mode
    const [isLockoutMode, setIsLockoutMode] = useState(false); // Lockout targeting mode

    // 新スキル用モード
    const [isPipelineMode, setIsPipelineMode] = useState(false);
    const [isTransferMode, setIsTransferMode] = useState(false);
    const [isPatchMode, setIsPatchMode] = useState(false);
    const [isIpBlockMode, setIsIpBlockMode] = useState(false);

    const [showHackerMenu, setShowHackerMenu] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    // 最終投票フェーズ用
    const [finalMurdererVote, setFinalMurdererVote] = useState('');
    const [finalHackerVote, setFinalHackerVote] = useState('');
    const [hasSubmittedFinalVote, setHasSubmittedFinalVote] = useState(false);
    const [finalVotingResult, setFinalVotingResult] = useState<string>('none');
    const [finalVotedCount, setFinalVotedCount] = useState(0);
    // GM観戦モード用
    const [isSpectator, setIsSpectator] = useState(false);
    const [gmPlayerInfo, setGmPlayerInfo] = useState<any[]>([]);
    // GM用: アクター情報付きログ (logId -> actor名)
    const [gmActorMap, setGmActorMap] = useState<{ [logId: string]: string }>({});


    // --- ログ ---
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // --- ターン更新時のAP処理 (デバフ・チャージ適用) ---
    useEffect(() => {
        const maxAp = 3 + chargedAp;
        setAp(Math.min(6, Math.max(0, maxAp - nextTurnDebuff)));
        setNextTurnDebuff(0); // 適用したらリセット
    }, [turn, chargedAp]);

    // --- Socketイベント設定 ---
    useEffect(() => {
        socket.on('state_update', (newState) => {
            setTurn(newState.turn); // ここでturnが更新されると上のuseEffectが発火
            setSystemHp(newState.hp);
            setDataLeak(newState.leak);
            setEvidenceAnalysis(newState.evidenceAnalysisProgress || 0);
            setTimeLeft(newState.timeLeft);
            setPhase(newState.phase);
            setPlayers(newState.players);

            // 自分の状態を確認
            const me = newState.players.find((p: any) => p.id === socket.id);
            if (me) {
                setIsIsolated(me.isIsolated);
                setChargedAp(me.chargedAp || 0); // サーバーのプレイヤーデータからチャージAPを取得
                if (me.role && me.role !== 'TBD') setMyRole(me.role);
            }

            // サーバー側でゲーム終了判定があれば受け取る
            if (newState.isPaused) {
                // 最終投票結果の確認
                if (newState.finalVotingResult && newState.finalVotingResult !== 'none') {
                    setGameResult(newState.finalVotingResult as GameResult);
                    setFinalVotingResult(newState.finalVotingResult);
                } else if (newState.evidenceAnalysisProgress >= 100) {
                    setGameResult('murderer_found');
                } else if (newState.hp <= 0) {
                    setGameResult('hacker_win_hp');
                } else if (newState.leak >= 100) {
                    setGameResult('hacker_win_leak');
                }
            }

            // 最終投票フェーズの投票数トラック
            if (newState.phase === 'final_voting') {
                setFinalVotedCount(Object.keys(newState.finalVotesMurderer || {}).length);
            }
        });

        socket.on('log_update', (newLog: LogEntry) => {
            setLogs(prev => [newLog, ...prev].slice(0, 100));
        });

        socket.on('log_history', (history: LogEntry[]) => {
            setLogs(history);
        });

        socket.on('private_message', (data: { senderId: string, senderName: string, message: string }) => {
            addLog(`PRIVATE DECRYPTED: ${data.message}`, 'warn');
        });

        socket.on('role_assigned', (data: { isHacker: boolean, isMurderer: boolean, roleName: string, secret: string }) => {
            setIsHacker(data.isHacker);
            setIsMurderer(data.isMurderer);
            setMySecret(data.secret);
            setMyRole(data.roleName);

            const roleIntel = data.isHacker ? "HACKER ACTIVATED" : (data.isMurderer ? "MURDERER ACTIVATED" : "EMPLOYEE VERIFIED");
            addLog(`RESTRICTED DATA RECEIVED: ${roleIntel}. Intel decrypted.`, 'system');
        });

        // デバフ・チャージ通知の受信
        socket.on('ap_debuff', (data: { amount: number, chargedAp: number }) => {
            // 次のターンに適用するために一時保存
            setNextTurnDebuff(data.amount);
            setChargedAp(data.chargedAp || 0);
            if (data.amount > 0) {
                addLog(`SYSTEM ALERT: RESOURCE THROTTLE SCHEDULED. AP -${data.amount} NEXT TURN.`, 'critical');
            }
        });

        // GM観戦モード用イベント
        socket.on('spectator_confirmed', () => {
            setIsSpectator(true);
            setIsJoined(true);
        });
        socket.on('gm_info', (info: any[]) => {
            setGmPlayerInfo(info);
        });
        // GM用: アクター情報付きログ
        socket.on('gm_log_update', (gmLog: any) => {
            if (gmLog.actor && gmLog.id) {
                setGmActorMap(prev => ({ ...prev, [gmLog.id]: gmLog.actor }));
            }
        });

        return () => {
            socket.off('state_update');
            socket.off('log_update');
            socket.off('log_history');
            socket.off('private_message');
            socket.off('role_assigned');
            socket.off('ap_debuff');
            socket.off('spectator_confirmed');
            socket.off('gm_info');
            socket.off('gm_log_update');
        };
    }, []);

    // --- Socket接続エラーハンドリング ---
    useEffect(() => {
        socket.on('connect_error', (err) => {
            console.error('Connection Error:', err);
            addLog(`CONNECTION ERROR: ${err.message}`, 'critical');
        });
        socket.on('connect', () => {
            addLog('ESTABLISHED CONNECTION TO MAINFRAME.', 'system');
        });
        return () => {
            socket.off('connect_error');
            socket.off('connect');
        };
    }, []);

    // --- ログ追加 (ローカルUI用 + サーバー同期待ち) ---
    const addLog = useCallback((content: string, level: LogEntry['level'] = 'info') => {
        // 即時反映（サーバーからのバック・エコーを待たずにUIの反応を良くするため）
        setLogs(prev => [{
            id: 'local-' + Date.now() + Math.random(),
            time: new Date().toLocaleTimeString(),
            level,
            content
        }, ...prev].slice(0, 100));
    }, []);

    // --- 時間フォーマット ---
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // --- フェーズ名取得 ---
    const getPhaseLabel = () => {
        if (stateCheckGameOver()) return 'GAME OVER';
        switch (phase) {
            case 'discussion': return '議論フェーズ';
            case 'action': return 'アクション入力';
            case 'resolve': return '解決フェーズ';
            case 'final_voting': return '最終投票';
        }
    };

    // --- 勝敗判定 (クライアント側表示用) ---
    const stateCheckGameOver = () => {
        if (systemHp <= 0) return 'hacker_win_hp';
        if (dataLeak >= 100) return 'hacker_win_leak';
        if (finalVotingResult !== 'none') return finalVotingResult;
        return null;
    };

    useEffect(() => {
        const res = stateCheckGameOver();
        if (res) setGameResult(res as GameResult);
        else setGameResult('playing');
    }, [systemHp, dataLeak, turn]);


    // --- 防衛側アクション ---
    const handleAction = (name: string, cost: number, targetId?: string) => {
        if (gameResult !== 'playing') return;
        // if (phase === 'resolve') return; // Tests

        if (ap >= cost) {
            setAp(prev => prev - cost);
            socket.emit('action', { type: name, cost, targetId });
            addLog(`COMMAND SENT: ${name}`, 'system');
        } else {
            addLog(`ERROR: INSUFFICIENT ACTION POINTS.`, 'warn');
        }
    };

    // --- ハッカー専用アクション ---
    const handleHackerAction = (name: string, cost: number) => {
        if (gameResult !== 'playing') return;

        if (ap >= cost) {
            setAp(prev => prev - cost);
            socket.emit('action', { type: name, cost });
            addLog(`HACKER COMMAND SENT: ${name}`, 'system');
        } else {
            addLog(`ERROR: ROOT PRIVILEGES - INSUFFICIENT POWER.`, 'warn');
        }
        setShowHackerMenu(false);
    };



    // 投票
    const handleVote = (targetId: string) => {
        socket.emit('vote', { targetId });
    };

    // 最終投票送信
    const handleFinalVoteSubmit = () => {
        if (!finalMurdererVote || !finalHackerVote) return;
        socket.emit('final_vote', {
            murdererVote: finalMurdererVote,
            hackerVote: finalHackerVote
        });
        setHasSubmittedFinalVote(true);
    };

    // --- リスタート ---
    const resetGame = () => {
        setAp(3);
        setGameResult('playing');
        setFinalMurdererVote('');
        setFinalHackerVote('');
        setHasSubmittedFinalVote(false);
        setFinalVotingResult('none');
        setFinalVotedCount(0);
        socket.emit('reset_game');
    };

    // 強制開始 (デバッグ用)
    const forceStart = () => {
        socket.emit('start_game_force');
    };



    // --- フェーズ変更時のアラート ---
    useEffect(() => {
        // const MAX_TIME = 10 * 60; // 本番用
        const MAX_TIME = 3 * 60; // 開発用
        const elapsed = MAX_TIME - timeLeft;

        // 開発用 (3分)
        if (elapsed === 2 * 60) { // 2分経過
            addLog('>>> ACTION PHASE STARTED. INPUT YOUR COMMANDS. <<<', 'system');
            setIsAlert(true);
            setTimeout(() => setIsAlert(false), 3000);
        }
        if (elapsed === 2 * 60 + 40) { // 2分40秒経過
            addLog('>>> RESOLVE PHASE. PROCESSING ALL ACTIONS... <<<', 'system');
        }

        /* 本番用 (10分)
        if (elapsed === 7 * 60) {
            addLog('>>> ACTION PHASE STARTED. INPUT YOUR COMMANDS. <<<', 'system');
            setIsAlert(true);
            setTimeout(() => setIsAlert(false), 3000);
        }
        if (elapsed === 9 * 60) {
            addLog('>>> RESOLVE PHASE. PROCESSING ALL ACTIONS... <<<', 'system');
        }
        */
    }, [timeLeft, addLog]);

    // --- ロビー画面 ---
    const handleJoin = (name: string) => {
        socket.emit('join_game', { name, role: 'TBD' });
        setIsJoined(true);
        setMyPlayerName(name);
        setMyRole('待機中...');
        addLog(`IDENTITY VERIFIED: ${name}`, 'system');
    };

    if (!isJoined) {
        return (
            <div className="terminal-screen flex flex-col items-center justify-center h-screen w-screen p-4 bg-black text-green-500 font-mono overflow-hidden">
                <style>{`
                    .glitch-text { position: relative; }
                    .glitch-text::before, .glitch-text::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
                    .glitch-text::before { left: 2px; text-shadow: -1px 0 red; clip: rect(24px, 550px, 90px, 0); animation: glitch-anim-2 3s infinite linear alternate-reverse; }
                    .glitch-text::after { left: -2px; text-shadow: -1px 0 blue; clip: rect(85px, 550px, 140px, 0); animation: glitch-anim 2.5s infinite linear alternate-reverse; }
                    @keyframes glitch-anim { 0% { clip: rect(10px, 9999px, 30px, 0); } 100% { clip: rect(80px, 9999px, 100px, 0); } }
                    @keyframes glitch-anim-2 { 0% { clip: rect(60px, 9999px, 80px, 0); } 100% { clip: rect(10px, 9999px, 100px, 0); } }
                    .lobby-container { background: radial-gradient(circle, rgba(0,20,0,1) 0%, rgba(0,0,0,1) 100%); }
                `}</style>
                <div className="mb-12 text-center z-10">
                    <h1 className="text-6xl font-bold mb-2 glitch-text tracking-tighter text-shadow-green" data-text="NEXUS_WAR">NEXUS_WAR</h1>
                    <p className="text-green-700 tracking-widest text-sm typing-anim">CYBER WARFARE SIMULATION PROTOCOL</p>
                </div>

                <div className="border border-green-500/50 p-8 rounded bg-black/90 max-w-4xl w-full shadow-[0_0_20px_rgba(0,255,0,0.2)] relative overflow-hidden backdrop-blur-sm z-10">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent"></div>
                    <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent"></div>

                    <h2 className="text-xl mb-8 text-center border-b border-green-500/30 pb-4 flex items-center justify-center gap-2 text-green-400">
                        <Lock size={20} /> 認証・ログイン
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {PLAYERS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleJoin(p.name)}
                                className="group relative border border-green-800 p-4 hover:border-green-400 hover:bg-green-500/10 text-left transition-all duration-300 overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-1 h-full bg-green-800 group-hover:bg-green-400 transition-colors"></div>
                                <div className="font-bold text-lg text-green-500 group-hover:text-green-300 mb-1 flex items-center gap-2 pl-2">
                                    {p.name}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 text-center text-xs text-green-900 border-t border-green-900/50 pt-4">
                        SECURE CONNECTION :: UNAUTHORIZED ACCESS PROHIBITED :: ID VERIFICATION MANDATORY
                    </div>

                    {/* GM観戦ボタン */}
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => socket.emit('join_spectator')}
                            className="border border-yellow-600/50 text-yellow-600 px-6 py-2 hover:bg-yellow-600/10 hover:border-yellow-400 transition-all text-sm"
                        >
                            <Eye size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
                            GM観戦モード
                        </button>
                    </div>
                </div>

                {/* Background Grid Effect */}
                <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{
                    backgroundImage: 'linear-gradient(green 1px, transparent 1px), linear-gradient(90deg, green 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}></div>
            </div >
        );
    }

    // --- GM観戦モードのUI ---
    if (isSpectator) {
        return (
            <div className="app-container">
                <header className="stat-bar">
                    <div className="stat-item" style={{ color: '#ffcc00' }}>
                        <Eye size={14} /> <span className="font-bold">GM観戦中</span>
                    </div>
                    <div className="stat-item">
                        <Cpu size={14} /> <span>HP: {systemHp}%</span>
                    </div>
                    <div className="stat-item">
                        <Database size={14} /> <span>LEAK: {dataLeak}%</span>
                    </div>
                    <div className="stat-item">
                        <Search size={14} /> <span>ANALYSIS: {evidenceAnalysis}%</span>
                    </div>
                    <div className="stat-item phase-tag">
                        <span>{getPhaseLabel()}</span>
                    </div>
                    <div className="stat-item">
                        TURN {turn}/8 | {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                    </div>
                </header>

                <div style={{ display: 'flex', gap: '1rem', padding: '1rem', height: 'calc(100vh - 50px)' }}>
                    {/* プレイヤー情報パネル */}
                    <div style={{
                        width: '220px', flexShrink: 0, background: '#0a0a1a',
                        border: '1px solid #333', borderRadius: '8px', padding: '0.8rem', overflowY: 'auto'
                    }}>
                        <h3 style={{ color: '#ffcc00', fontSize: '0.9rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                            <Eye size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            プレイヤー情報
                        </h3>
                        {gmPlayerInfo.length > 0 ? gmPlayerInfo.map((p: any) => (
                            <div key={p.id} style={{
                                padding: '0.6rem', marginBottom: '0.5rem', borderRadius: '4px',
                                border: `1px solid ${p.isHacker ? '#ff4444' : p.isMurderer ? '#bc13fe' : '#00ff88'}`,
                                background: p.isIsolated ? 'rgba(255,0,0,0.1)' : 'rgba(255,255,255,0.03)'
                            }}>
                                <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>
                                    {p.name}
                                    <span style={{ color: '#888', fontSize: '0.7rem', marginLeft: '6px' }}>{p.role}</span>
                                </div>
                                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                    {p.isHacker && <span style={{ color: '#ff4444', fontWeight: 'bold', marginRight: '8px' }}>HACKER</span>}
                                    {p.isMurderer && <span style={{ color: '#bc13fe', fontWeight: 'bold', marginRight: '8px' }}>MURDERER</span>}
                                    {!p.isHacker && !p.isMurderer && <span style={{ color: '#00ff88' }}>社員</span>}
                                    {p.isIsolated && <span style={{ color: '#ff8800', marginLeft: '8px' }}>隔離中</span>}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>VOTES: {p.votes}</div>
                            </div>
                        )) : (
                            <p style={{ color: '#555', fontSize: '0.8rem' }}>ゲーム開始待ち... ({players.length}/6 接続)</p>
                        )}

                        {/* デバッグ用: 強制開始ボタン */}
                        {players.length > 0 && gmPlayerInfo.length === 0 && (
                            <button
                                onClick={() => socket.emit('start_game_force')}
                                style={{
                                    width: '100%', marginTop: '1rem', padding: '0.5rem',
                                    background: '#333', color: '#ffcc00', border: '1px solid #ffcc00',
                                    borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem'
                                }}
                            >
                                FORCE START GAME (役職配布)
                            </button>
                        )}
                    </div>

                    {/* ログパネル */}
                    <div style={{
                        flex: 1, background: '#0a0a1a',
                        border: '1px solid #333', borderRadius: '8px', padding: '1rem', overflowY: 'auto'
                    }}>
                        <h3 style={{ color: '#00ff88', fontSize: '0.9rem', marginBottom: '1rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
                            <Terminal size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                            システムログ
                        </h3>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {logs.map(log => (
                                <div key={log.id} style={{
                                    padding: '3px 0', color:
                                        log.level === 'critical' ? '#ff4444' :
                                            log.level === 'warn' ? '#ffcc00' :
                                                log.level === 'system' ? '#00ff88' : '#888',
                                    display: 'flex', gap: '6px', alignItems: 'flex-start'
                                }}>
                                    <span style={{ color: '#555', flexShrink: 0 }}>[{log.time}]</span>
                                    {gmActorMap[log.id] && (
                                        <span style={{
                                            background: '#2a1a4a', color: '#c8a2ff', padding: '0 4px',
                                            borderRadius: '3px', fontSize: '0.7rem', fontWeight: 'bold',
                                            flexShrink: 0, border: '1px solid #6b3fa0'
                                        }}>
                                            {gmActorMap[log.id]}
                                        </span>
                                    )}
                                    <span style={{ wordBreak: 'break-word' }}>{log.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const getThemeClass = () => {
        if (isHacker) return 'hacker-theme';
        if (isMurderer) return 'murderer-theme';
        return '';
    };

    return (
        <div className={`app-container ${isAlert ? 'alert-mode' : ''}`}>
            {/* --- Header --- */}
            <header className="stat-bar">
                <div className="stat-item text-green-400">
                    <User size={14} /> <span className="font-bold">{myPlayerName}</span> <span className="text-xs opacity-70">[{myRole}]</span>
                </div>
                <div className="stat-item">
                    <Cpu size={14} /> <span>HP: {systemHp}%</span>
                </div>
                <div className="stat-item ap-gauge">
                    <Zap size={14} /> <span>AP: {ap}/{(isHacker || isMurderer) ? 6 : 3}</span>
                </div>
                <div className="stat-item phase-tag">
                    <span>{getPhaseLabel()}</span>
                </div>
            </header>

            {/* --- HP & Leak & Analysis Bars --- */}
            <div className="progress-bars">
                <div className="bar-container">
                    <div className="bar-label"><Shield size={12} /> システムHP</div>
                    <div className="bar-track">
                        <div className="bar-fill hp-bar" style={{ width: `${systemHp}%` }} />
                    </div>
                    <span className="bar-value">{systemHp}%</span>
                </div>
                <div className="bar-container">
                    <div className="bar-label"><Database size={12} /> データ漏洩</div>
                    <div className="bar-track">
                        <div className="bar-fill leak-bar" style={{ width: `${dataLeak}%` }} />
                    </div>
                    <span className="bar-value">{dataLeak}%</span>
                </div>
                <div className="bar-container">
                    <div className="bar-label"><Search size={12} /> 証拠解析</div>
                    <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${evidenceAnalysis}%`, backgroundColor: '#00ffff', boxShadow: '0 0 10px #00ffff' }} />
                    </div>
                    <span className="bar-value">{evidenceAnalysis}%</span>
                </div>
            </div>

            {/* --- Personal Secret --- */}
            <div className="secret-intel-box">
                <div className="secret-header"><Lock size={12} /> 機密情報 (あなたの秘密)</div>
                <div className="secret-body">
                    {isHacker && <div className="text-red-500 font-bold">[役割: ハッカー] 目的: データ流出100% または システムHPを0にせよ。</div>}
                    {isMurderer && <div className="text-purple-400 font-bold">[役割: 殺人犯] 目的: 証拠解析(100%)を阻止せよ。</div>}
                    {!isHacker && !isMurderer && <div className="text-green-400 font-bold">[役割: 社員] 目的: 証拠解析(100%)を完了させつつ、防衛せよ。</div>}
                    <div className="mt-2 text-sm opacity-80">{mySecret || 'システムを守り切れ！'}</div>
                </div>
                {isIsolated && (
                    <div className="isolated-alert text-red-500 font-bold flex items-center gap-2 mt-2">
                        <AlertTriangle size={16} /> リソース制限中: 投票により -3 AP
                    </div>
                )}
            </div>

            {/* --- Main Dashboard --- */}
            <main className="dashboard">
                {/* Log Screen */}
                <section className="log-screen">
                    <div className="screen-header">
                        <Terminal size={14} /> <span>システムログ</span>
                        <span className="log-count">{logs.length} 件</span>
                    </div>
                    <div className="log-content">
                        {logs.map(log => (
                            <div key={log.id} className={`log-entry ${log.level}`}>
                                <span className="log-time">[{log.time}]</span>
                                <span className="log-msg">{log.content}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Player List & Voting */}
                <section className="player-list-section">
                    <div className="screen-header">
                        <User size={14} /> 社員リスト
                        {isTraceMode && <span className="ml-2 text-yellow-400 animate-pulse">[ログ追跡: 対象を選択してください]</span>}
                        {isDdosMode && <span className="ml-2 text-red-400 animate-pulse">[DDOS攻撃: 対象を選択してください]</span>}
                        {isFalseFlagMode && <span className="ml-2 text-purple-400 animate-pulse">[偽装工作: 対象を選択してください]</span>}
                        {isLockoutMode && <span className="ml-2 text-red-400 animate-pulse">[ロックアウト: 対象を選択してください]</span>}
                        {isPipelineMode && <span className="ml-2 text-cyan-400 animate-pulse">[パイプライン: 協力者を選択]</span>}
                        {isTransferMode && <span className="ml-2 text-indigo-400 animate-pulse">[リソース譲渡: 送信先を選択]</span>}
                        {isPatchMode && <span className="ml-2 text-green-400 animate-pulse">[パッチ適用: 対象を選択]</span>}
                        {isIpBlockMode && <span className="ml-2 text-red-400 animate-pulse">[IPブロック: 遮断対象を選択]</span>}
                    </div>
                    <div className="player-grid">
                        {players.map(p => (
                            <div key={p.id} className={`player-card ${p.isIsolated ? 'isolated' : ''}`}>
                                <div className="p-info">
                                    <div className="p-name">{p.name}</div>
                                    {/* <div className="p-role text-xs opacity-50">{p.role}</div> */}
                                    {p.votes > 0 && <div className="p-votes">疑惑度: {p.votes}</div>}
                                </div>
                                {isJoined && p.id !== socket.id && (
                                    <>
                                        {!isTraceMode && !isDdosMode && !isFalseFlagMode && !isLockoutMode && !isPipelineMode && !isTransferMode && !isPatchMode && !isIpBlockMode && (
                                            <button onClick={() => handleVote(p.id)} className="btn-vote">投票</button>
                                        )}
                                        {isTraceMode && myRole === 'ネットワーク管理者' && (
                                            <button
                                                onClick={() => {
                                                    handleAction('TRACE_LOG', 1, p.id);
                                                    setIsTraceMode(false);
                                                }}
                                                className="btn-vote btn-trace"
                                                style={{ borderColor: '#ffff00', color: '#ffff00' }}
                                            >
                                                TRACE
                                            </button>
                                        )}
                                        {isDdosMode && isHacker && (
                                            <button
                                                onClick={() => {
                                                    handleAction('DDOS', 1, p.id);
                                                    setIsDdosMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#ff4444', color: '#ff4444' }}
                                            >
                                                DDOS
                                            </button>
                                        )}
                                        {isFalseFlagMode && isHacker && (
                                            <button
                                                onClick={() => {
                                                    handleAction('FALSE_FLAG', 1, p.id);
                                                    setIsFalseFlagMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#ff00ff', color: '#ff00ff' }}
                                            >
                                                FAKE
                                            </button>
                                        )}
                                        {isFalseFlagMode && isMurderer && !isHacker && (
                                            <button
                                                onClick={() => {
                                                    handleAction('FALSE_FLAG', 1, p.id);
                                                    setIsFalseFlagMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#ff00ff', color: '#ff00ff' }}
                                            >
                                                FAKE
                                            </button>
                                        )}
                                        {isLockoutMode && isMurderer && (
                                            <button
                                                onClick={() => {
                                                    handleAction('LOCKOUT', 2, p.id);
                                                    setIsLockoutMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#ff0000', color: '#ff0000' }}
                                            >
                                                LOCK
                                            </button>
                                        )}

                                        {/* 新スキル用ターゲット選択ボタン */}
                                        {isPipelineMode && myRole === 'DevOps' && (
                                            <button
                                                onClick={() => {
                                                    handleAction('PIPELINE', 1, p.id);
                                                    setIsPipelineMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#00ffff', color: '#00ffff' }}
                                            >
                                                CONNECT
                                            </button>
                                        )}
                                        {isTransferMode && myRole === 'システムオペレーター' && (
                                            <button
                                                onClick={() => {
                                                    handleAction('TRANSFER', 1, p.id);
                                                    setIsTransferMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#8888ff', color: '#8888ff' }}
                                            >
                                                GIVE AP
                                            </button>
                                        )}
                                        {isPatchMode && myRole === 'セキュリティ分析官' && (
                                            <button
                                                onClick={() => {
                                                    handleAction('PATCH', 1, p.id);
                                                    setIsPatchMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                            >
                                                PATCH
                                            </button>
                                        )}
                                        {isIpBlockMode && myRole === 'ネットワーク管理者' && (
                                            <button
                                                onClick={() => {
                                                    handleAction('IP_BLOCK', 2, p.id);
                                                    setIsIpBlockMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#ff4444', color: '#ff4444' }}
                                            >
                                                BLOCK
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                <section className={`action-panel ${getThemeClass()} ${isHacker ? 'hacker-panel' : ''}`}>
                    <div className="panel-title" style={{ color: getThemeClass() ? 'var(--text-active)' : 'var(--text-dim)' }}>
                        {isHacker ? 'ハッカーコンソール' : '社員用コンソール'}
                    </div>

                    {!isHacker ? (
                        /* === 防衛側ボタン === */
                        <div className="action-grid">
                            {!isMurderer && (
                                <>
                                    <button
                                        onClick={() => handleAction('ANALYZE_EVIDENCE', 2)}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                    >
                                        <Search size={18} /> <span>証拠解析</span><span className="ap-cost">2AP {'->'} 解析+10%</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('RESTORE_SYSTEM', 2)}
                                        className="btn-action"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                    >
                                        <Shield size={18} /> <span>システム修復</span><span className="ap-cost">2AP {'->'} HP+10%</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('ENCRYPT_DATA', 2)}
                                        className="btn-action"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                    >
                                        <Lock size={18} /> <span>データ暗号化</span><span className="ap-cost">2AP {'->'} 漏洩-10%</span>
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => handleAction('VIEW_AUDIT_LOG', 1)}
                                className="btn-action"
                                disabled={phase === 'resolve' || ap < 1}
                                style={{ borderColor: isMurderer ? '#cc44ff' : '#00ff88', color: isMurderer ? '#cc44ff' : '#00ff88' }}
                            >
                                <Eye size={18} /> <span>監査ログ</span><span className="ap-cost" style={isMurderer ? { color: '#ffff00' } : {}}>1AP</span>
                            </button>

                            {/* --- Murderer Skill --- */}
                            {isMurderer && (
                                <>
                                    <button
                                        onClick={() => handleAction('SABOTAGE', 1)}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 1}
                                        style={{ borderColor: '#cc44ff', color: '#cc44ff' }}
                                        title="System Sabotage (HP -5)"
                                    >
                                        <Skull size={18} /> <span>サボタージュ</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP {'->'} HP-5</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('TAMPER_EVIDENCE', 1)}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 1}
                                        style={{ borderColor: '#cc44ff', color: '#cc44ff' }}
                                    >
                                        <Database size={18} /> <span>証拠改ざん</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP {'->'} 解析-5%</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('BLACKOUT', 2)}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#cc44ff', color: '#cc44ff' }}
                                    >
                                        <Zap size={18} /> <span>停電工作</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} 議論短縮</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('PHYSICAL_DESTROY', 2)}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#cc44ff', color: '#cc44ff' }}
                                    >
                                        <AlertTriangle size={18} /> <span>物理破壊</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} BOT破壊</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsLockoutMode(!isLockoutMode);
                                            setIsFalseFlagMode(false);
                                        }}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={isLockoutMode ? { backgroundColor: 'rgba(204, 68, 255, 0.2)', borderColor: '#cc44ff', color: '#cc44ff' } : { borderColor: '#cc44ff', color: '#cc44ff' }}
                                    >
                                        <Lock size={18} /> <span>ロックアウト</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} 行動封鎖</span>
                                    </button>
                                </>
                            )}

                            {/* --- 防衛側ユニークアクション --- */}
                            {/* --- 防衛側ユニークアクション --- */}
                            {/* --- 防衛側ユニークアクション --- */}
                            {myRole === 'ネットワーク管理者' && (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsTraceMode(!isTraceMode);
                                            setIsIpBlockMode(false);
                                        }}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 1}
                                        style={isTraceMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)', borderColor: '#ffff00', color: '#ffff00' } : { borderColor: '#ffff00', color: '#ffff00' }}
                                    >
                                        <Search size={18} /> <span>ログ追跡</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsIpBlockMode(!isIpBlockMode);
                                            setIsTraceMode(false);
                                        }}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={isIpBlockMode ? { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}
                                    >
                                        <Lock size={18} /> <span>IPブロック</span><span className="ap-cost" style={{ color: '#ff4444' }}>2AP</span>
                                    </button>
                                </>
                            )}

                            {myRole === 'セキュリティ分析官' && (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsPatchMode(!isPatchMode);
                                        }}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 1}
                                        style={isPatchMode ? { backgroundColor: 'rgba(0, 255, 136, 0.2)', borderColor: '#00ff88', color: '#00ff88' } : { borderColor: '#00ff88', color: '#00ff88' }}
                                    >
                                        <Shield size={18} /> <span>パッチ適用</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP</span>
                                    </button>
                                    <button onClick={() => handleAction('FIREWALL', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Shield size={18} /> <span>ファイアウォール</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP</span>
                                    </button>
                                </>
                            )}

                            {myRole === 'DBエンジニア' && (
                                <>
                                    <button onClick={() => handleAction('MASKING', 1)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Database size={18} /> <span>マスキング</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP</span>
                                    </button>
                                    <button onClick={() => handleAction('HONEY_POT', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Database size={18} /> <span>ハニーポット</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP</span>
                                    </button>
                                </>
                            )}

                            {myRole === 'システムオペレーター' && (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsTransferMode(!isTransferMode);
                                        }}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 1}
                                        style={isTransferMode ? { backgroundColor: 'rgba(136, 136, 255, 0.2)', borderColor: '#8888ff', color: '#8888ff' } : { borderColor: '#8888ff', color: '#8888ff' }}
                                    >
                                        <RotateCcw size={18} /> <span>リソース譲渡</span><span className="ap-cost" style={{ color: '#8888ff' }}>1AP</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('FORCE_REBOOT', 2)}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#ff4444', color: '#ff4444' }}
                                    >
                                        <Zap size={18} /> <span>強制再起動</span><span className="ap-cost" style={{ color: '#ff4444' }}>2AP</span>
                                    </button>
                                </>
                            )}

                            {myRole === 'インフラリーダー' && (
                                <>
                                    <button onClick={() => handleAction('LOAD_BALANCER', 1)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Cpu size={18} /> <span>負荷分散</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP</span>
                                    </button>
                                    <button onClick={() => handleAction('SERVER_OVERCLOCK', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Zap size={18} /> <span>オーバークロック</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP</span>
                                    </button>
                                </>
                            )}

                            {myRole === 'DevOps' && (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsPipelineMode(!isPipelineMode);
                                        }}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 1}
                                        style={isPipelineMode ? { backgroundColor: 'rgba(0, 255, 255, 0.2)', borderColor: '#00ffff', color: '#00ffff' } : { borderColor: '#00ffff', color: '#00ffff' }}
                                    >
                                        <Cpu size={18} /> <span>CI/CDパイプライン</span><span className="ap-cost" style={{ color: '#00ffff' }}>1AP</span>
                                    </button>
                                    <button onClick={() => handleAction('DEPLOY_BOT', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Cpu size={18} /> <span>解析BOT配備</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP</span>
                                    </button>
                                </>
                            )}

                            <button
                                onContextMenu={(e) => { e.preventDefault(); setIsHacker(!isHacker); }}
                                onClick={() => {
                                    addLog(`STATUS: HP=${systemHp}% | LEAK=${dataLeak}% | AP=${ap}/3`, 'info');
                                }}
                                className="btn-action btn-status"
                            >
                                <AlertTriangle size={18} /> <span>ステータス</span>
                            </button>
                        </div>
                    ) : (
                        /* === ハッカー側ボタン === */
                        <div className="action-grid hacker-grid">
                            <button
                                onClick={() => handleAction('INJECT_MALWARE', 2)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve' || ap < 2}
                            >
                                <Skull size={18} /> <span>マルウェア</span><span className="ap-cost">2AP {'->'} HP-40%</span>
                            </button>
                            <button
                                onClick={() => handleAction('EXFILTRATE', 1)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve' || ap < 1}
                            >
                                <Database size={18} /> <span>持ち出し</span><span className="ap-cost">1AP {'->'} 漏洩+15%</span>
                            </button>
                            <button
                                onClick={() => handleAction('COVER_TRACKS', 1)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve' || ap < 1}
                            >
                                <Lock size={18} /> <span>痕跡消去</span><span className="ap-cost">1AP {'->'} 痕跡消去</span>
                            </button>
                            <button
                                onClick={() => {
                                    setIsDdosMode(!isDdosMode);
                                    setIsFalseFlagMode(false);
                                }}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve' || ap < 1}
                                style={isDdosMode ? { backgroundColor: 'rgba(255, 68, 68, 0.3)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}
                            >
                                <Zap size={18} /> <span>DDOS攻撃</span><span className="ap-cost">1AP {'->'} AP-2</span>
                            </button>
                            <button
                                onClick={() => {
                                    setIsFalseFlagMode(!isFalseFlagMode);
                                    setIsDdosMode(false);
                                }}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve' || ap < 1}
                                style={isFalseFlagMode ? { backgroundColor: 'rgba(255, 68, 68, 0.3)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}
                            >
                                <AlertTriangle size={18} /> <span>偽装工作</span><span className="ap-cost">1AP {'->'} POSITIVE偽装</span>
                            </button>
                            <button
                                onClick={() => handleAction('VIEW_AUDIT_LOG', 1)}
                                className="btn-action"
                                disabled={phase === 'resolve' || ap < 1}
                                style={{ borderColor: '#ff4444', color: '#ff4444' }}
                            >
                                <Eye size={18} /> <span>監査(偽装)</span><span className="ap-cost">1AP {'->'} ログ調査(偽装)</span>
                            </button>

                            <button
                                onContextMenu={(e) => { e.preventDefault(); setIsHacker(!isHacker); }}
                                onClick={() => {
                                    addLog(`STATUS: HP=${systemHp}% | LEAK=${dataLeak}% | AP=${ap}/3`, 'info');
                                }}
                                className="btn-action btn-status"
                            >
                                <AlertTriangle size={18} /> <span>戻る</span>
                            </button>
                        </div>
                    )}
                </section>
            </main>

            {/* --- Footer --- */}
            <footer className="footer">
                <div className="turn-info">
                    TURN {turn} / 8 | {formatTime(timeLeft)} | {getPhaseLabel()}
                </div>
                <button
                    onClick={forceStart}
                    style={{
                        marginLeft: 'auto',
                        background: 'rgba(255, 100, 100, 0.1)',
                        border: '1px solid rgba(255, 100, 100, 0.3)',
                        color: 'rgba(255, 150, 150, 0.7)',
                        padding: '2px 8px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginRight: '8px'
                    }}
                >
                    <Zap size={10} /> 強制開始 (役職配布)
                </button>
                <button
                    onClick={resetGame}
                    style={{
                        marginLeft: 'auto',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.5)',
                        padding: '2px 8px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    <RotateCcw size={10} /> デバッグリセット
                </button>
            </footer>

            {/* --- ハッカー専用メニュー (オーバーレイ) --- */}
            {
                showHackerMenu && (
                    <div className="modal-overlay" onClick={() => setShowHackerMenu(false)}>
                        <div className="hacker-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header hacker-header">
                                <Skull size={16} /> <span>ルート権限アクセス</span>
                                <button className="modal-close" onClick={() => setShowHackerMenu(false)}><X size={14} /></button>
                            </div>
                            <div className="hacker-actions">
                                <button onClick={() => handleHackerAction('INJECT_MALWARE', 2)} className="btn-hacker-action">
                                    <Skull size={16} /> マルウェア注入 (2AP) <span className="effect-tag">HP -40%</span>
                                </button>
                                <button onClick={() => handleHackerAction('EXFILTRATE', 1)} className="btn-hacker-action">
                                    <Database size={16} /> データ持ち出し (1AP) <span className="effect-tag">漏洩 +15%</span>
                                </button>
                                <button onClick={() => handleHackerAction('COVER_TRACKS', 1)} className="btn-hacker-action">
                                    <Lock size={16} /> 痕跡消去 (1AP) <span className="effect-tag">ログ完全消去</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }


            {/* --- 最終投票フェーズ画面 --- */}
            {
                phase === 'final_voting' && gameResult === 'playing' && (
                    <div className="modal-overlay game-over-overlay">
                        <div className="game-over-modal" style={{ maxWidth: '500px' }}>
                            <div className="game-over-icon win">
                                <Eye size={48} />
                            </div>
                            <h2 className="game-over-title win" style={{ fontSize: '1.4rem' }}>
                                最終告発
                            </h2>
                            <p className="game-over-sub" style={{ marginBottom: '1.5rem' }}>
                                8ターン生存完了。殺人犯とハッカーを指名してください。
                            </p>

                            {!hasSubmittedFinalVote ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 1rem' }}>
                                    {/* 殺人犯投票 */}
                                    <div style={{ textAlign: 'left' }}>
                                        <label style={{ color: '#ff4444', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>
                                            <Skull size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                            殺人犯は誰だ？ (必須)
                                        </label>
                                        <select
                                            value={finalMurdererVote}
                                            onChange={(e) => setFinalMurdererVote(e.target.value)}
                                            style={{
                                                width: '100%', padding: '0.6rem', background: '#1a1a2e',
                                                color: '#fff', border: '1px solid #ff4444', borderRadius: '4px',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            <option value="">-- 選択してください --</option>
                                            {players.filter(p => p.id !== socket.id).map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* ハッカー投票 */}
                                    <div style={{ textAlign: 'left' }}>
                                        <label style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>
                                            <Zap size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                            ハッカーは誰だ？ (ボーナス)
                                        </label>
                                        <select
                                            value={finalHackerVote}
                                            onChange={(e) => setFinalHackerVote(e.target.value)}
                                            style={{
                                                width: '100%', padding: '0.6rem', background: '#1a1a2e',
                                                color: '#fff', border: '1px solid #00ff88', borderRadius: '4px',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            <option value="">-- 選択してください --</option>
                                            {players.filter(p => p.id !== socket.id).map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <button
                                        onClick={handleFinalVoteSubmit}
                                        disabled={!finalMurdererVote || !finalHackerVote}
                                        style={{
                                            padding: '0.8rem', background: finalMurdererVote && finalHackerVote ? '#00ff88' : '#333',
                                            color: finalMurdererVote && finalHackerVote ? '#000' : '#666',
                                            border: 'none', borderRadius: '4px', fontWeight: 'bold',
                                            fontSize: '1rem', cursor: finalMurdererVote && finalHackerVote ? 'pointer' : 'not-allowed',
                                            marginTop: '0.5rem'
                                        }}
                                    >
                                        告発する
                                    </button>
                                </div>
                            ) : (
                                <div style={{ padding: '1rem', textAlign: 'center' }}>
                                    <p style={{ color: '#00ff88', fontSize: '1.1rem', fontWeight: 'bold' }}>
                                        ✓ 投票完了
                                    </p>
                                    <p style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                        他のプレイヤーの投票を待っています... ({finalVotedCount}/{players.length})
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* --- ゲームオーバー画面 --- */}
            {
                gameResult !== 'playing' && (
                    <div className="modal-overlay game-over-overlay">
                        <div className="game-over-modal">
                            <div className={`game-over-icon ${gameResult === 'employee_perfect_win' || gameResult === 'employee_win' || gameResult === 'murderer_found' ? 'win' : 'lose'
                                }`}>
                                {(gameResult === 'employee_perfect_win' || gameResult === 'employee_win' || gameResult === 'murderer_found')
                                    ? <Trophy size={48} />
                                    : <Skull size={48} />
                                }
                            </div>
                            <h2 className={`game-over-title ${gameResult === 'employee_perfect_win' || gameResult === 'employee_win' || gameResult === 'murderer_found' ? 'win' : 'lose'
                                }`}>
                                {gameResult === 'employee_perfect_win' && '★ 完全勝利 ★'}
                                {gameResult === 'employee_win' && '社員勝利'}
                                {gameResult === 'murderer_found' && '殺人犯確保'}
                                {gameResult === 'murderer_escape' && '殺人犯逃亡'}
                                {gameResult === 'hacker_win_hp' && 'ハッカー勝利'}
                                {gameResult === 'hacker_win_leak' && 'ハッカー勝利'}
                            </h2>
                            <p className="game-over-sub">
                                {gameResult === 'employee_perfect_win' && '殺人犯もハッカーも特定！完全勝利！'}
                                {gameResult === 'employee_win' && '殺人犯を特定！しかしハッカーは逃走した...'}
                                {gameResult === 'murderer_found' && '証拠解析完了。殺人犯を特定しました。'}
                                {gameResult === 'murderer_escape' && '殺人犯の特定に失敗...犯人は闇に消えた。'}
                                {gameResult === 'hacker_win_hp' && 'システムHPが0%になりました。インフラ崩壊。'}
                                {gameResult === 'hacker_win_leak' && 'データ流出完了。全ファイルが漏洩しました。'}
                            </p>
                            <div className="game-over-stats">
                                <div className="stat-row"><span>最終HP</span><span>{systemHp}%</span></div>
                                <div className="stat-row"><span>最終漏洩率</span><span>{dataLeak}%</span></div>
                                <div className="stat-row"><span>経過ターン</span><span>{turn} / 8</span></div>
                            </div>
                            <button className="btn-restart" onClick={resetGame}>
                                <RotateCcw size={16} /> ミッション再開
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

export default App;
