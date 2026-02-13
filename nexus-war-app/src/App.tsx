import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { Terminal, Shield, AlertTriangle, MessageSquare, Zap, Cpu, Eye, Skull, Lock, Send, X, Wifi, Database, Search, RotateCcw, Trophy, Clock } from 'lucide-react';

// --- 型定義 ---
interface LogEntry {
    id: string;
    time: string;
    level: 'info' | 'warn' | 'critical' | 'system';
    content: string;
}

type TurnPhase = 'discussion' | 'action' | 'resolve';
type GameResult = 'playing' | 'hacker_win_hp' | 'hacker_win_leak' | 'defense_win';

// デバッグ用タイムスケール（1秒あたりの経過秒数）
const TIME_SCALES = [1, 10, 60];

interface TurnEvent {
    turn: number;
    title: string;
    description: string;
    level: 'info' | 'warn' | 'critical';
}

// --- ターンイベント定義 ---
const TURN_EVENTS: TurnEvent[] = [
    { turn: 1, title: 'SYSTEM BREACH DETECTED', description: 'ALL SYSTEMS ENCRYPTED. RANSOMWARE PAYLOAD ACTIVE.', level: 'critical' },
    { turn: 2, title: 'BACKUP CORRUPTION', description: 'BACKUP SERVER #2 INTEGRITY CHECK FAILED. DATA HASH MISMATCH.', level: 'critical' },
    { turn: 3, title: 'LATERAL MOVEMENT', description: 'UNAUTHORIZED SSH SESSION FROM 10.0.3.77 TO DB_MASTER.', level: 'warn' },
    { turn: 4, title: 'INSIDER ALERT', description: 'PRIVILEGE ESCALATION DETECTED ON UID:4021. ROOT ACCESS GRANTED.', level: 'critical' },
    { turn: 5, title: 'DATA EXFILTRATION', description: 'OUTBOUND TRAFFIC SPIKE: 2.4GB TO EXTERNAL IP 185.xx.xx.xx.', level: 'critical' },
    { turn: 6, title: 'COUNTER-ATTACK', description: 'FIREWALL RULE #47 BYPASSED. NEW C2 CHANNEL ESTABLISHED.', level: 'warn' },
    { turn: 7, title: 'FINAL PHASE', description: 'DECRYPTION KEY FRAGMENT LOCATED IN /tmp/.shadow_cache.', level: 'info' },
    { turn: 8, title: 'ENDGAME', description: 'SYSTEM LOCKDOWN IN 15 MINUTES. ALL OPERATORS REPORT STATUS.', level: 'critical' },
];

// --- プレイヤー定義（デモ用） ---
const PLAYERS = [
    { id: 'p1', name: 'KOBAYASHI', role: 'Network Admin' },
    { id: 'p2', name: 'TANAKA', role: 'Security Analyst' },
    { id: 'p3', name: 'SUZUKI', role: 'DB Engineer' },
    { id: 'p4', name: 'YAMADA', role: 'Sys Operator' },
    { id: 'p5', name: 'SATO', role: 'Infra Lead' },
    { id: 'p6', name: 'NAKAMURA', role: 'Dev Ops' },
];

function App() {
    // --- ゲーム状態 ---
    const [ap, setAp] = useState(3);
    const [turn, setTurn] = useState(1);
    const [timeLeft, setTimeLeft] = useState(15 * 60);
    const [phase, setPhase] = useState<TurnPhase>('discussion');
    const [systemHp, setSystemHp] = useState(100);
    const [dataLeak, setDataLeak] = useState(0);
    const [gameResult, setGameResult] = useState<GameResult>('playing');
    const [timeScale, setTimeScale] = useState(1);

    // --- UI状態 ---
    const [isHacker, setIsHacker] = useState(false);
    const [showHackerMenu, setShowHackerMenu] = useState(false);
    const [showMsgModal, setShowMsgModal] = useState(false);
    const [msgTarget, setMsgTarget] = useState('');
    const [msgText, setMsgText] = useState('');
    const [isAlert, setIsAlert] = useState(false);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // --- ログ ---
    const [logs, setLogs] = useState<LogEntry[]>([
        { id: '0', time: '09:00:00', level: 'system', content: '=== PROJECT: NEXUS_WAR [TURN-BASED EDITION] ===' },
        { id: '1', time: '09:00:00', level: 'info', content: 'SYSTEM INITIALIZED. WELCOME, OPERATOR.' },
        { id: '2', time: '09:00:05', level: 'critical', content: 'EXTERNAL DDOS ATTACK DETECTED ON PORT 80.' },
    ]);

    // --- ログ追加 ---
    const addLog = useCallback((content: string, level: LogEntry['level'] = 'info') => {
        const newLog: LogEntry = {
            id: Date.now().toString() + Math.random(),
            time: new Date().toLocaleTimeString(),
            level,
            content
        };
        setLogs(prev => [newLog, ...prev].slice(0, 100));
    }, []);

    // --- ターンイベント発火 ---
    const fireTurnEvent = useCallback((turnNum: number) => {
        const event = TURN_EVENTS.find(e => e.turn === turnNum);
        if (event) {
            addLog(`=== ${event.title} ===`, 'system');
            addLog(event.description, event.level);
        }
    }, [addLog]);

    // --- フェーズ計算 ---
    useEffect(() => {
        const elapsed = 15 * 60 - timeLeft;
        if (elapsed < 10 * 60) {
            setPhase('discussion');
        } else if (elapsed < 14 * 60) {
            setPhase('action');
        } else {
            setPhase('resolve');
        }
    }, [timeLeft]);

    // --- タイマーとターンのロジック ---
    useEffect(() => {
        if (gameResult !== 'playing') return; // ゲーム終了時は停止

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                const next = prev - timeScale;
                if (next <= 0) {
                    setTurn((t) => {
                        if (t >= 8) {
                            // Turn 8 終了 → 防衛側勝利判定
                            setGameResult('defense_win');
                            addLog('=== GAME OVER: DEFENSE TEAM WINS ===', 'system');
                            return t;
                        }
                        const nextTurn = t + 1;
                        setTimeout(() => fireTurnEvent(nextTurn), 500);
                        return nextTurn;
                    });
                    setAp(3);
                    addLog(`TURN COMPLETED. AP REPLENISHED. AWAITING NEXT PHASE.`, 'system');
                    return 15 * 60;
                }
                return next;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [addLog, fireTurnEvent, gameResult, timeScale]);

    // --- 初期ターンイベント ---
    useEffect(() => {
        fireTurnEvent(1);
    }, []);

    // --- 勝敗判定 ---
    useEffect(() => {
        if (gameResult !== 'playing') return;
        if (systemHp <= 0) {
            setGameResult('hacker_win_hp');
            addLog('=== CRITICAL: SYSTEM DESTROYED. HACKER WINS ===', 'critical');
        } else if (dataLeak >= 100) {
            setGameResult('hacker_win_leak');
            addLog('=== CRITICAL: DATA FULLY EXFILTRATED. HACKER WINS ===', 'critical');
        }
    }, [systemHp, dataLeak, gameResult, addLog]);

    // --- 時間フォーマット ---
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // --- フェーズ名取得 ---
    const getPhaseLabel = () => {
        if (gameResult !== 'playing') return '🔴 GAME OVER';
        switch (phase) {
            case 'discussion': return '📡 DISCUSSION';
            case 'action': return '⚡ ACTION INPUT';
            case 'resolve': return '🔄 RESOLVING';
        }
    };

    // --- リスタート ---
    const resetGame = () => {
        setAp(3);
        setTurn(1);
        setTimeLeft(15 * 60);
        setPhase('discussion');
        setSystemHp(100);
        setDataLeak(0);
        setGameResult('playing');
        setIsHacker(false);
        setShowHackerMenu(false);
        setShowMsgModal(false);
        setIsAlert(false);
        setLogs([
            { id: '0', time: new Date().toLocaleTimeString(), level: 'system', content: '=== PROJECT: NEXUS_WAR [RESTARTED] ===' },
            { id: '1', time: new Date().toLocaleTimeString(), level: 'info', content: 'SYSTEM RE-INITIALIZED. ALL PARAMETERS RESET.' },
        ]);
        setTimeout(() => fireTurnEvent(1), 300);
    };

    // --- 防衛側アクション ---
    const handleAction = (name: string, cost: number, effect?: () => void) => {
        if (gameResult !== 'playing') return;
        if (phase === 'resolve') {
            addLog('LOCKED: SYSTEM IS RESOLVING. WAIT FOR NEXT TURN.', 'warn');
            return;
        }
        if (ap >= cost) {
            setAp(prev => prev - cost);
            addLog(`EXECUTING: ${name}...`, 'info');
            setTimeout(() => {
                addLog(`SUCCESS: ${name} COMPLETED.`, 'info');
                effect?.();
            }, 800);
        } else {
            addLog('ERROR: INSUFFICIENT AP.', 'warn');
        }
    };

    // --- ハッカー専用アクション ---
    const handleHackerAction = (name: string, cost: number) => {
        if (ap >= cost) {
            setAp(prev => prev - cost);
            addLog(`EXECUTING: ${name}...`, 'info'); // ハッカー側にも通常ログが出る（自分だけ）

            setTimeout(() => {
                // ハッカーの効果
                if (name === 'INJECT_MALWARE') {
                    setSystemHp(prev => Math.max(0, prev - 15));
                    addLog('PAYLOAD DELIVERED. TARGET HP -15%.', 'critical');
                    // 全体ログには別の形で出る（将来のSocket.io実装で対応）
                } else if (name === 'EXFILTRATE') {
                    setDataLeak(prev => Math.min(100, prev + 20));
                    addLog('DATA SIPHONED: +20% EXFILTRATION PROGRESS.', 'critical');
                } else if (name === 'COVER_TRACKS') {
                    addLog('LOG ENTRIES PURGED. TRACES REMOVED.', 'info');
                }
            }, 800);
        } else {
            addLog('ERROR: INSUFFICIENT AP.', 'warn');
        }
        setShowHackerMenu(false);
    };

    // --- 密談送信 ---
    const sendMessage = () => {
        if (!msgTarget || !msgText.trim()) return;
        if (ap < 1) {
            addLog('ERROR: INSUFFICIENT AP FOR ENCRYPTED MSG.', 'warn');
            return;
        }
        setAp(prev => prev - 1);
        const target = PLAYERS.find(p => p.id === msgTarget);
        addLog(`MSG SENT TO ${target?.name || 'UNKNOWN'}: [ENCRYPTED]`, 'info');
        // 実際のSocket.io実装時はサーバー経由で配信
        setMsgText('');
        setShowMsgModal(false);
    };

    // --- 長押し検出（ハッカーメニュー） ---
    const handleLongPressStart = () => {
        longPressTimer.current = setTimeout(() => {
            if (isHacker) {
                setShowHackerMenu(true);
            }
        }, 800);
    };

    const handleLongPressEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }
    };

    // --- フェーズ変更時のアラート ---
    useEffect(() => {
        const elapsed = 15 * 60 - timeLeft;
        if (elapsed === 10 * 60) {
            addLog('>>> ACTION PHASE STARTED. INPUT YOUR COMMANDS. <<<', 'system');
            setIsAlert(true);
            setTimeout(() => setIsAlert(false), 3000);
        }
        if (elapsed === 14 * 60) {
            addLog('>>> RESOLVE PHASE. PROCESSING ALL ACTIONS... <<<', 'system');
        }
    }, [timeLeft, addLog]);

    return (
        <div className={`app-container ${isAlert ? 'alert-mode' : ''}`}>
            {/* --- Header --- */}
            <header className="stat-bar">
                <div className="stat-item">
                    <Cpu size={14} /> <span>HP: {systemHp}%</span>
                </div>
                <div className="stat-item ap-gauge">
                    <Zap size={14} /> <span>AP: {ap}/3</span>
                </div>
                <div className="stat-item phase-tag">
                    <span>{getPhaseLabel()}</span>
                </div>
            </header>

            {/* --- HP & Leak Bars --- */}
            <div className="progress-bars">
                <div className="bar-container">
                    <div className="bar-label"><Shield size={12} /> SYSTEM HP</div>
                    <div className="bar-track">
                        <div className="bar-fill hp-bar" style={{ width: `${systemHp}%` }} />
                    </div>
                    <span className="bar-value">{systemHp}%</span>
                </div>
                <div className="bar-container">
                    <div className="bar-label"><Database size={12} /> DATA LEAK</div>
                    <div className="bar-track">
                        <div className="bar-fill leak-bar" style={{ width: `${dataLeak}%` }} />
                    </div>
                    <span className="bar-value">{dataLeak}%</span>
                </div>
            </div>

            {/* --- Main Dashboard --- */}
            <main className="dashboard">
                {/* Log Screen */}
                <section className="log-screen">
                    <div className="screen-header">
                        <Terminal size={14} /> <span>SYSTEM_LOG</span>
                        <span className="log-count">{logs.length} entries</span>
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

                {/* Action Panel */}
                <section className={`action-panel ${isHacker ? 'hacker-panel' : ''}`}>
                    <div className="panel-title">
                        {isHacker ? '💀 ATTACK CONSOLE [ROOT ACCESS]' : '🛡️ ACTIONS'}
                    </div>

                    {/* === 防衛側ボタン === */}
                    {!isHacker && (
                        <div className="action-grid">
                            <button
                                onClick={() => handleAction('NETWORK_SCAN', 1, () => {
                                    addLog('SCAN RESULT: 3 ACTIVE SESSIONS, 1 ANOMALY DETECTED.', 'warn');
                                })}
                                className="btn-action"
                                disabled={phase === 'resolve'}
                            >
                                <Search size={18} /> <span>SCAN</span><span className="ap-cost">1AP</span>
                            </button>
                            <button
                                onClick={() => handleAction('SECURITY_PATCH', 2, () => {
                                    setSystemHp(prev => Math.min(100, prev + 10));
                                    addLog('SYSTEM HP RESTORED: +10%.', 'info');
                                })}
                                className="btn-action"
                                disabled={phase === 'resolve'}
                            >
                                <Shield size={18} /> <span>PATCH</span><span className="ap-cost">2AP</span>
                            </button>
                            <button
                                onClick={() => setShowMsgModal(true)}
                                className="btn-action"
                                disabled={phase === 'resolve'}
                            >
                                <MessageSquare size={18} /> <span>MSG</span><span className="ap-cost">1AP</span>
                            </button>
                            <button
                                onClick={() => handleAction('VIEW_AUDIT_LOG', 1, () => {
                                    addLog('AUDIT: UID:4021 accessed /etc/shadow at 08:47.', 'warn');
                                    addLog('AUDIT: UID:1088 modified firewall.conf at 08:52.', 'info');
                                })}
                                className="btn-action"
                                disabled={phase === 'resolve'}
                            >
                                <Eye size={18} /> <span>AUDIT</span><span className="ap-cost">1AP</span>
                            </button>
                            <button
                                onContextMenu={(e) => { e.preventDefault(); setIsHacker(!isHacker); }}
                                onClick={() => {
                                    addLog(`STATUS: HP=${systemHp}% | LEAK=${dataLeak}% | AP=${ap}/3`, 'info');
                                }}
                                className="btn-action btn-status"
                            >
                                <AlertTriangle size={18} /> <span>STATUS</span>
                            </button>
                        </div>
                    )}

                    {/* === ハッカー側ボタン === */}
                    {isHacker && (
                        <div className="action-grid hacker-grid">
                            <button
                                onClick={() => handleHackerAction('INJECT_MALWARE', 1)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve'}
                            >
                                <Skull size={18} /> <span>INJECT</span><span className="ap-cost">1AP → HP-15%</span>
                            </button>
                            <button
                                onClick={() => handleHackerAction('EXFILTRATE', 2)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve'}
                            >
                                <Database size={18} /> <span>EXFIL</span><span className="ap-cost">2AP → LEAK+20%</span>
                            </button>
                            <button
                                onClick={() => handleHackerAction('COVER_TRACKS', 1)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve'}
                            >
                                <Lock size={18} /> <span>COVER</span><span className="ap-cost">1AP → 痕跡消去</span>
                            </button>
                            <button
                                onClick={() => setShowMsgModal(true)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve'}
                            >
                                <MessageSquare size={18} /> <span>MSG</span><span className="ap-cost">1AP</span>
                            </button>
                            <button
                                onContextMenu={(e) => { e.preventDefault(); setIsHacker(!isHacker); }}
                                onClick={() => {
                                    addLog(`STATUS: HP=${systemHp}% | LEAK=${dataLeak}% | AP=${ap}/3`, 'info');
                                }}
                                className="btn-action btn-hacker btn-status"
                            >
                                <AlertTriangle size={18} /> <span>BACK</span>
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
                <div className="debug-controls">
                    <Clock size={10} />
                    {TIME_SCALES.map(s => (
                        <button
                            key={s}
                            className={`debug-btn ${timeScale === s ? 'active' : ''}`}
                            onClick={() => setTimeScale(s)}
                        >
                            {s}x
                        </button>
                    ))}
                </div>
            </footer>

            {/* --- ハッカー専用メニュー (オーバーレイ) --- */}
            {showHackerMenu && (
                <div className="modal-overlay" onClick={() => setShowHackerMenu(false)}>
                    <div className="hacker-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header hacker-header">
                            <Skull size={16} /> <span>ROOT ACCESS</span>
                            <button className="modal-close" onClick={() => setShowHackerMenu(false)}><X size={14} /></button>
                        </div>
                        <div className="hacker-actions">
                            <button onClick={() => handleHackerAction('INJECT_MALWARE', 1)} className="btn-hacker-action">
                                <Skull size={16} /> INJECT MALWARE (1AP) <span className="effect-tag">HP -15%</span>
                            </button>
                            <button onClick={() => handleHackerAction('EXFILTRATE', 2)} className="btn-hacker-action">
                                <Database size={16} /> EXFILTRATE DATA (2AP) <span className="effect-tag">LEAK +20%</span>
                            </button>
                            <button onClick={() => handleHackerAction('COVER_TRACKS', 1)} className="btn-hacker-action">
                                <Lock size={16} /> COVER TRACKS (1AP) <span className="effect-tag">PURGE LOGS</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- 密談モーダル --- */}
            {showMsgModal && (
                <div className="modal-overlay" onClick={() => setShowMsgModal(false)}>
                    <div className="msg-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <Lock size={16} /> <span>ENCRYPTED MESSAGE (1AP)</span>
                            <button className="modal-close" onClick={() => setShowMsgModal(false)}><X size={14} /></button>
                        </div>
                        <div className="msg-body">
                            <label className="msg-label">TARGET:</label>
                            <div className="player-select">
                                {PLAYERS.map(p => (
                                    <button
                                        key={p.id}
                                        className={`player-chip ${msgTarget === p.id ? 'selected' : ''}`}
                                        onClick={() => setMsgTarget(p.id)}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                            <label className="msg-label">MESSAGE:</label>
                            <textarea
                                className="msg-input"
                                value={msgText}
                                onChange={(e) => setMsgText(e.target.value)}
                                placeholder="Type your message..."
                                maxLength={140}
                            />
                            <button className="btn-send" onClick={sendMessage}>
                                <Send size={14} /> SEND ENCRYPTED
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ゲームオーバー画面 --- */}
            {gameResult !== 'playing' && (
                <div className="modal-overlay game-over-overlay">
                    <div className="game-over-modal">
                        <div className={`game-over-icon ${gameResult === 'defense_win' ? 'win' : 'lose'}`}>
                            {gameResult === 'defense_win' ? <Trophy size={48} /> : <Skull size={48} />}
                        </div>
                        <h2 className={`game-over-title ${gameResult === 'defense_win' ? 'win' : 'lose'}`}>
                            {gameResult === 'defense_win' ? 'DEFENSE WINS' : 'HACKER WINS'}
                        </h2>
                        <p className="game-over-sub">
                            {gameResult === 'hacker_win_hp' && 'SYSTEM HP REACHED 0%. INFRASTRUCTURE DESTROYED.'}
                            {gameResult === 'hacker_win_leak' && 'DATA EXFILTRATION COMPLETE. ALL FILES COMPROMISED.'}
                            {gameResult === 'defense_win' && 'ALL 8 TURNS SURVIVED. SYSTEM INTEGRITY MAINTAINED.'}
                        </p>
                        <div className="game-over-stats">
                            <div className="stat-row"><span>FINAL HP</span><span>{systemHp}%</span></div>
                            <div className="stat-row"><span>DATA LEAKED</span><span>{dataLeak}%</span></div>
                            <div className="stat-row"><span>TURNS PLAYED</span><span>{turn} / 8</span></div>
                        </div>
                        <button className="btn-restart" onClick={resetGame}>
                            <RotateCcw size={16} /> RESTART MISSION
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
