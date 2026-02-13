import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { Terminal, Shield, AlertTriangle, MessageSquare, Zap, Cpu, Eye, Skull, Lock, Send, X, Database, Search, RotateCcw, Trophy, User } from 'lucide-react';
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

type TurnPhase = 'discussion' | 'action' | 'resolve';
type GameResult = 'playing' | 'hacker_win_hp' | 'hacker_win_leak' | 'defense_win';

// プレイヤー定義（デモ用）
const PLAYERS = [
    { id: 'p1', name: 'KOBAYASHI', role: 'Network Admin' },
    { id: 'p2', name: 'TANAKA', role: 'Security Analyst' },
    { id: 'p3', name: 'SUZUKI', role: 'DB Engineer' },
    { id: 'p4', name: 'YAMADA', role: 'Sys Operator' },
    { id: 'p5', name: 'SATO', role: 'Infra Lead' },
    { id: 'p6', name: 'NAKAMURA', role: 'Dev Ops' },
];

function App() {
    // --- ゲーム状態 (サーバー同期) ---
    const [ap, setAp] = useState(3);
    const [turn, setTurn] = useState<number>(1); // ローカルで保持して比較用に使用
    const [timeLeft, setTimeLeft] = useState(15 * 60);
    const [phase, setPhase] = useState<TurnPhase>('discussion');
    const [systemHp, setSystemHp] = useState(100);
    const [dataLeak, setDataLeak] = useState(0);
    const [gameResult, setGameResult] = useState<GameResult>('playing');

    // --- UI状態 (ローカル) ---
    const [isJoined, setIsJoined] = useState(false);
    const [myPlayerName, setMyPlayerName] = useState('');
    const [myRole, setMyRole] = useState('');
    const [isHacker, setIsHacker] = useState(false);
    const [showHackerMenu, setShowHackerMenu] = useState(false);
    const [showMsgModal, setShowMsgModal] = useState(false);
    const [msgTarget, setMsgTarget] = useState('');
    const [msgText, setMsgText] = useState('');
    const [isAlert, setIsAlert] = useState(false);


    // --- ログ ---
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // --- Socketイベント設定 ---
    useEffect(() => {
        socket.on('state_update', (newState) => {
            // ターンが変わったらAP回復
            setTurn(prevTurn => {
                if (newState.turn > prevTurn) {
                    setAp(3);
                    // 音を鳴らすなどの通知もここで可能
                }
                return newState.turn;
            });

            setSystemHp(newState.hp);
            setDataLeak(newState.leak);
            // setTurn は上記で実施済み
            setTimeLeft(newState.timeLeft);
            setPhase(newState.phase);

            // サーバー側でゲーム終了判定があれば受け取る（未実装ならクライアント判定のままにするか要検討）
            if (newState.timeLeft <= 0 && newState.turn >= 8) {
                // 仮：サーバーからの勝敗通知イベントを作るべきだが、一旦状態から判定
            }
        });

        socket.on('log_update', (newLog: LogEntry) => {
            setLogs(prev => [newLog, ...prev].slice(0, 100));
        });

        socket.on('log_history', (history: LogEntry[]) => {
            setLogs(history);
        });

        return () => {
            socket.off('state_update');
            socket.off('log_update');
            socket.off('log_history');
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
        if (stateCheckGameOver()) return '🔴 GAME OVER';
        switch (phase) {
            case 'discussion': return '📡 DISCUSSION';
            case 'action': return '⚡ ACTION INPUT';
            case 'resolve': return '🔄 RESOLVING';
        }
    };

    // --- 勝敗判定 (クライアント側表示用) ---
    const stateCheckGameOver = () => {
        if (systemHp <= 0) return 'hacker_win_hp';
        if (dataLeak >= 100) return 'hacker_win_leak';
        if (turn > 8) return 'defense_win';
        return null;
    };

    useEffect(() => {
        const res = stateCheckGameOver();
        if (res) setGameResult(res as GameResult);
        else setGameResult('playing');
    }, [systemHp, dataLeak, turn]);


    // --- 防衛側アクション ---
    const handleAction = (name: string, cost: number) => {
        if (gameResult !== 'playing') return;
        if (phase === 'resolve') return;

        if (ap >= cost) {
            setAp(prev => prev - cost); // APはとりあえずローカル管理
            socket.emit('action', { type: name, cost });
        } else {
            // ローカルエラーログ
        }
    };

    // --- ハッカー専用アクション ---
    const handleHackerAction = (name: string, cost: number) => {
        if (ap >= cost) {
            setAp(prev => prev - cost);
            socket.emit('action', { type: name, cost });
        }
        setShowHackerMenu(false);
    };

    // --- 密談送信 ---
    const sendMessage = () => {
        if (!msgTarget || !msgText.trim()) return;
        if (ap < 1) return;

        setAp(prev => prev - 1);
        socket.emit('chat_message', { targetId: msgTarget, message: msgText, senderName: 'ME' });

        setMsgText('');
        setShowMsgModal(false);
    };



    // --- リスタート ---
    const resetGame = () => {
        socket.emit('reset_game');
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

    // --- ロビー画面 ---
    const handleJoin = (name: string, role: string) => {
        socket.emit('join_game', { name, role });
        setIsJoined(true);
        setMyPlayerName(name);
        setMyRole(role);
        addLog(`IDENTITY VERIFIED: ${name} [${role}]`, 'system');
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
                        <Lock size={20} /> AUTHENTICATION REQUIRED
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {PLAYERS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleJoin(p.name, p.role)}
                                className="group relative border border-green-800 p-4 hover:border-green-400 hover:bg-green-500/10 text-left transition-all duration-300 overflow-hidden"
                            >
                                <div className="absolute top-0 left-0 w-1 h-full bg-green-800 group-hover:bg-green-400 transition-colors"></div>
                                <div className="font-bold text-lg text-green-500 group-hover:text-green-300 mb-1 flex items-center gap-2 pl-2">
                                    {p.name}
                                </div>
                                <div className="text-xs text-green-700 group-hover:text-green-500 pl-2">{p.role}</div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 text-center text-xs text-green-900 border-t border-green-900/50 pt-4">
                        SECURE CONNECTION :: UNAUTHORIZED ACCESS PROHIBITED :: ID VERIFICATION MANDATORY
                    </div>
                </div>

                {/* Background Grid Effect */}
                <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{
                    backgroundImage: 'linear-gradient(green 1px, transparent 1px), linear-gradient(90deg, green 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}></div>
            </div>
        );
    }

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
                                onClick={() => handleAction('NETWORK_SCAN', 1)}
                                className="btn-action"
                                disabled={phase === 'resolve'}
                            >
                                <Search size={18} /> <span>SCAN</span><span className="ap-cost">1AP</span>
                            </button>
                            <button
                                onClick={() => handleAction('SECURITY_PATCH', 2)}
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
                                onClick={() => handleAction('VIEW_AUDIT_LOG', 1)}
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
