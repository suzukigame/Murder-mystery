import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { Terminal, Shield, AlertTriangle, Zap, Cpu, Eye, Skull, Lock, X, Database, Search, RotateCcw, Trophy, User, LogOut } from 'lucide-react';
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


function App() {
    // --- ゲーム状態 (サーバー同期) ---
    const [ap, setAp] = useState(3);
    const [turn, setTurn] = useState<number>(1);
    const [timeLeft, setTimeLeft] = useState(1 * 60); // 開発用 1分
    // const [timeLeft, setTimeLeft] = useState(10 * 60); // 本番用 10分
    const [phase, setPhase] = useState<TurnPhase>('discussion');
    const [systemHp, setSystemHp] = useState(100);
    const [maxHp, setMaxHp] = useState(100);
    const [dataLeak, setDataLeak] = useState(0);
    const [evidenceAnalysis, setEvidenceAnalysis] = useState(0); // 証拠解析率
    const [gameResult, setGameResult] = useState<GameResult>('playing');
    const [nextTurnDebuff, setNextTurnDebuff] = useState(0); // 次ターンのデバフ一時保存
    const [chargedAp, setChargedAp] = useState(0); // チャージAP（ハッカー/殺人犯専用）
    const [turnDuration, setTurnDuration] = useState(1 * 60); // デフォルト1分

    // --- UI状態 (ローカル) ---
    const [isJoined, setIsJoined] = useState(false);
    const [myPlayerName, setMyPlayerName] = useState(sessionStorage.getItem('nexus_player_name') || '');
    const [myRole, setMyRole] = useState('');
    const [mySecret, setMySecret] = useState('');
    const [isHacker, setIsHacker] = useState(false);
    const [isMurderer, setIsMurderer] = useState(false); // 新: 殺人犯フラグ
    const [isIsolated, setIsIsolated] = useState(false);
    const [isIpBlocked, setIsIpBlocked] = useState(false); // IPブロック状態
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

    // コピーしたスキル用
    const [copiedSkill, setCopiedSkill] = useState<string | null>(null);
    const [copiedSkillLabel, setCopiedSkillLabel] = useState<string | null>(null);
    const [isCopiedSkillMode, setIsCopiedSkillMode] = useState(false);

    const [showHackerMenu, setShowHackerMenu] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    // 最終投票フェーズ用
    const [finalMurdererVote, setFinalMurdererVote] = useState('');
    const [finalHackerVote, setFinalHackerVote] = useState('');
    const [hasSubmittedFinalVote, setHasSubmittedFinalVote] = useState(false);
    const [finalVotingResult, setFinalVotingResult] = useState<string>('none');
    const [finalVotedCount, setFinalVotedCount] = useState(0);
    const [revealedMurdererName, setRevealedMurdererName] = useState<string | null>(null);
    // GM観戦モード用
    const [isSpectator, setIsSpectator] = useState(false);
    const [gmPlayerInfo, setGmPlayerInfo] = useState<any[]>([]);
    const [hasPendingActions, setHasPendingActions] = useState(false);
    const [nullifyUsedThisTurn, setNullifyUsedThisTurn] = useState(false);
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
            setMaxHp(newState.maxHp || 100);
            setDataLeak(newState.leak);
            setEvidenceAnalysis(newState.evidenceAnalysisProgress || 0);
            setTurnDuration(newState.turnDuration || 60);
            setTimeLeft(newState.timeLeft);
            setPhase(newState.phase);
            setPlayers(newState.players);
            setHasPendingActions(newState.hasPendingActions || false);
            setRevealedMurdererName(newState.revealedMurdererName || null);

            // 自分の状態を確認
            const me = newState.players.find((p: any) => p.id === socket.id);
            if (me) {
                setIsIsolated(me.isIsolated);
                setIsIpBlocked(me.isIpBlocked || false); // サーバーからの状態を反映
                setChargedAp(me.chargedAp || 0); // サーバーのプレイヤーデータからチャージAPを取得
                if (me.role && me.role !== 'TBD') setMyRole(me.role);
                setNullifyUsedThisTurn(me.nullifyUsedThisTurn || false);

                // コピーしたスキルがあればステートに反映
                if (me.copiedSkill) {
                    setCopiedSkill(me.copiedSkill);
                    setCopiedSkillLabel(me.copiedSkillLabel || me.copiedSkill);
                } else {
                    setCopiedSkill(null);
                    setCopiedSkillLabel(null);
                }
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
        if (isIpBlocked) {
            addLog('ERROR: CONNECTION SEVERED. IP BLOCKED.', 'critical');
            return;
        }
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
        if (isIpBlocked) {
            addLog('ERROR: CONNECTION SEVERED. IP BLOCKED.', 'critical');
            return;
        }

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

    // 投票取消
    const handleCancelVote = () => {
        socket.emit('cancel_vote');
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
    }, [timeLeft, addLog, turnDuration]);

    // --- セッション復帰 (自動入室) ---
    useEffect(() => {
        const savedName = sessionStorage.getItem('nexus_player_name');
        const savedToken = sessionStorage.getItem('nexus_session_token');
        if (savedName && savedToken) {
            console.log('Attempting session recovery...', savedName);
            socket.emit('join_game', { name: savedName, role: 'reconnect', token: savedToken });
        }
    }, []);

    // --- 入室結果のハンドリング ---
    useEffect(() => {
        const handleJoinSuccess = (data: { name: string, token: string }) => {
            setIsJoined(true);
            setMyPlayerName(data.name);
            sessionStorage.setItem('nexus_player_name', data.name);
            sessionStorage.setItem('nexus_session_token', data.token);
            addLog(`SESSION VERIFIED: ${data.name}. ACCESS GRANTED.`, 'system');
        };

        const handleError = (msg: string) => {
            addLog(`SECURITY ALERT: ${msg}`, 'critical');
            if (msg.includes('認証エラー')) {
                sessionStorage.removeItem('nexus_player_name');
                sessionStorage.removeItem('nexus_session_token');
            }
        };

        socket.on('join_success', handleJoinSuccess);
        socket.on('error', handleError);

        return () => {
            socket.off('join_success', handleJoinSuccess);
            socket.off('error', handleError);
        };
    }, [addLog]);

    // --- ロビー画面 ---
    const handleJoin = (name: string) => {
        const token = sessionStorage.getItem('nexus_session_token') || undefined;
        socket.emit('join_game', { name, role: 'TBD', token });
        setMyPlayerName(name);
    };

    const handleLeave = () => {
        socket.emit('leave_game');
        sessionStorage.removeItem('nexus_player_name');
        sessionStorage.removeItem('nexus_session_token');
        setIsJoined(false);
        setMyPlayerName('');
        addLog('LOGOUT: SECURITY CLEARANCE REVOKED.', 'system');
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
                    <h1 className="text-6xl font-bold mb-2 glitch-text tracking-tighter text-shadow-green" data-text="SKY-MAGYCC JUDAS">SKY-MAGYCC JUDAS</h1>
                    <p className="text-green-700 tracking-widest text-sm typing-anim">THE JUDAS PROTOCOL :: GLOBAL INCIDENT</p>
                </div>

                <div className="border border-green-500/50 p-8 rounded bg-black/90 max-w-4xl w-full shadow-[0_0_20px_rgba(0,255,0,0.2)] relative overflow-hidden backdrop-blur-sm z-10">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent"></div>
                    <div className="absolute bottom-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-green-500 to-transparent"></div>

                    <h2 className="text-xl mb-8 text-center border-b border-green-500/30 pb-4 flex items-center justify-center gap-2 text-green-400">
                        <Lock size={20} /> 認証・ログイン
                    </h2>

                    <div className="flex flex-col items-center gap-6 py-4">
                        <div className="w-full max-w-sm">
                            <label className="block text-xs text-green-700 mb-2 tracking-widest">ENTER IDENTIFICATION NAME</label>
                            <input
                                type="text"
                                value={myPlayerName}
                                onChange={(e) => setMyPlayerName(e.target.value.slice(0, 12))}
                                placeholder="USERNAME..."
                                className="w-full bg-black border border-green-500/30 p-4 text-green-500 font-mono focus:outline-none focus:border-green-400 focus:shadow-[0_0_10px_rgba(0,255,0,0.2)] transition-all"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && myPlayerName.trim()) handleJoin(myPlayerName.trim());
                                }}
                            />
                            <div className="flex justify-between mt-2">
                                <span className="text-[10px] text-green-900 tracking-tighter">MAX 12 CHARACTERS</span>
                                <span className="text-[10px] text-green-900 tracking-tighter">{myPlayerName.length}/12</span>
                            </div>
                        </div>

                        <button
                            onClick={() => handleJoin(myPlayerName.trim())}
                            disabled={!myPlayerName.trim()}
                            className="bg-green-500/20 border border-green-500 text-green-400 px-12 py-3 hover:bg-green-500 hover:text-black transition-all font-bold tracking-widest disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-green-400"
                        >
                            ESTABLISH CONNECTION
                        </button>
                    </div>

                    <div className="mt-8 text-center text-xs text-green-900 border-t border-green-900/50 pt-4">
                        SECURE CONNECTION :: UNAUTHORIZED ACCESS PROHIBITED :: ID VERIFICATION MANDATORY
                    </div>

                    {/* Main Action UI */}
                    {isIpBlocked && (
                        <div className="alert-box critical">
                            <AlertTriangle size={24} />
                            <span>WARNING: IP BLOCKED BY ADMINISTRATOR. ACTIONS DISABLED.</span>
                        </div>
                    )}
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => socket.emit('join_spectator')}
                            className="border border-yellow-600/50 text-yellow-600 px-6 py-2 hover:bg-yellow-600/10 hover:border-yellow-400 transition-all text-sm"
                        >
                            <Eye size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
                            GM観戦モード
                        </button>
                    </div>

                    {/* ターン時間設定 (ロビー) */}
                    {!players.some(p => p.id === socket.id) && (
                        <div className="mt-8 pt-6 border-t border-green-900/50">
                            <h3 className="text-sm text-green-400 mb-4 flex items-center justify-center gap-2">
                                <Zap size={14} /> システム設定（ホスト）
                            </h3>
                            <div className="flex flex-col items-center gap-3">
                                <label className="text-xs text-green-700">1ターンの長さ: {turnDuration / 60} 分</label>
                                <input
                                    type="range"
                                    min="60"
                                    max="600"
                                    step="60"
                                    value={turnDuration}
                                    onChange={(e) => socket.emit('update_settings', { turnDuration: parseInt(e.target.value) })}
                                    className="w-64 accent-green-500 bg-green-900/30 h-1 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between w-64 text-[10px] text-green-900 mt-1">
                                    <span>1 MIN</span>
                                    <span>5 MIN</span>
                                    <span>10 MIN</span>
                                </div>
                            </div>
                        </div>
                    )}
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
                        <Cpu size={14} /> <span>HP: {maxHp > 100 ? `${systemHp}/${maxHp}` : `${systemHp}%`}</span>
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

                {/* --- Footer Timer (GM) --- */}
                <footer className="timer-footer">
                    <div
                        className={`timer-progress-bar ${timeLeft / turnDuration <= 0.2 ? 'urgent' : ''}`}
                        style={{ width: `${(timeLeft / turnDuration) * 100}%` }}
                    />
                    <div className="timer-text">
                        <span>TURN {turn}/8</span>
                        <span>|</span>
                        <span>{formatTime(timeLeft)}</span>
                        <span>|</span>
                        <span>{getPhaseLabel()}</span>
                    </div>
                </footer>
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
                    <Cpu size={14} /> <span>HP: {maxHp > 100 ? `${systemHp}/${maxHp}` : `${systemHp}%`}</span>
                </div>
                <div className="stat-item ap-gauge">
                    <Zap size={14} /> <span>AP: {ap}/{(isHacker || isMurderer) ? 6 : 3}</span>
                </div>
                <div className="stat-item phase-tag">
                    <span>{getPhaseLabel()}</span>
                </div>
                <button onClick={handleLeave} className="stat-item hover:text-red-500 transition-colors ml-auto flex items-center gap-1">
                    <LogOut size={14} /> <span>退室</span>
                </button>
            </header>

            {/* --- HP & Leak & Analysis Bars --- */}
            <div className="progress-bars">
                <div className="bar-container">
                    <div className="bar-label"><Shield size={12} /> システムHP</div>
                    <div className="bar-track">
                        <div className="bar-fill hp-bar" style={{ width: `${Math.min(100, (systemHp / maxHp) * 100)}%` }} />
                    </div>
                    <span className="bar-value">{maxHp > 100 ? `${systemHp}/${maxHp}` : `${systemHp}%`}</span>
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
                    <div className="bar-track" style={{ position: 'relative', overflow: 'visible' }}>
                        <div className="bar-fill" style={{ width: `${evidenceAnalysis}%`, backgroundColor: '#00ffff', boxShadow: '0 0 10px #00ffff' }} />
                        {revealedMurdererName && (
                            <div className="absolute right-0 flex items-center pr-1" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 0, zIndex: 10 }}>
                                <span style={{
                                    color: '#fff',
                                    background: '#ff0044',
                                    fontWeight: 'bold',
                                    fontSize: '0.8rem',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    boxShadow: '0 0 5px rgba(0,0,0,0.5)',
                                    whiteSpace: 'nowrap'
                                }}>
                                    犯人特定: {revealedMurdererName}
                                </span>
                            </div>
                        )}
                    </div>
                    <span className="bar-value">{evidenceAnalysis}%</span>
                </div>
            </div>

            {/* 行動詠唱中の警告表示 */}
            {hasPendingActions && (
                <div className="activity-alert">
                    <Zap size={16} className="pulse" />
                    <span>不審なプロセスを検知中: システム負荷が上昇しています...</span>
                </div>
            )}

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
                        {isCopiedSkillMode && <span className="ml-2 text-purple-400 animate-pulse">[{copiedSkillLabel}: 対象を選択]</span>}
                    </div>
                    <div className="player-grid">
                        {[...players].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                            <div key={p.id} className={`player-card ${p.isIsolated ? 'isolated' : ''} ${p.id === socket.id ? 'is-me' : ''}`}>
                                <div className="p-info">
                                    <div className="p-name">{p.name}</div>
                                    {/* <div className="p-role text-xs opacity-50">{p.role}</div> */}
                                    {p.votes > 0 && <div className="p-votes">疑惑度: {p.votes}</div>}
                                </div>
                                {isJoined && p.id !== socket.id && (
                                    <>
                                        {!isTraceMode && !isDdosMode && !isFalseFlagMode && !isLockoutMode && !isPipelineMode && !isTransferMode && !isPatchMode && !isIpBlockMode && (
                                            <>
                                                <button onClick={() => handleVote(p.id)} className="btn-vote">投票</button>
                                                <button onClick={() => handleCancelVote()} className="btn-vote" style={{ backgroundColor: 'rgba(255,68,68,0.15)', borderColor: '#ff4444', color: '#ff8888', marginLeft: '4px', fontSize: '0.7rem', padding: '2px 6px' }}>取消</button>
                                            </>
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

                                        {/* コピーしたスキル用ターゲット選択ボタン */}
                                        {isCopiedSkillMode && copiedSkill && (
                                            <button
                                                onClick={() => {
                                                    handleAction(copiedSkill, 1, p.id);
                                                    setIsCopiedSkillMode(false);
                                                }}
                                                className="btn-vote"
                                                style={{ borderColor: '#bc13fe', color: '#bc13fe' }}
                                            >
                                                USE SKILL
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
                                        onClick={() => handleAction('RESTORE_SYSTEM', 2)}
                                        className="btn-action"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                    >
                                        <Shield size={18} /> <span>システム修復</span><span className="ap-cost">2AP {'->'} HP+10</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('ENCRYPT_DATA', 2)}
                                        className="btn-action"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                    >
                                        <Lock size={18} /> <span>データ暗号化</span><span className="ap-cost">2AP {'->'} 漏洩-10%</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('ANALYZE_EVIDENCE', 2)}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                    >
                                        <Search size={18} /> <span>証拠解析</span><span className="ap-cost">2AP {'->'} 解析+10%</span>
                                    </button>
                                </>
                            )}
                            {!isMurderer && (
                                <button
                                    onClick={() => handleAction('VIEW_AUDIT_LOG', 1)}
                                    className="btn-action"
                                    disabled={phase === 'resolve' || ap < 1}
                                    style={{ borderColor: '#00ff88', color: '#00ff88' }}
                                >
                                    <Eye size={18} /> <span>監査ログ</span><span className="ap-cost">1AP</span>
                                </button>
                            )}

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
                                        onClick={() => {
                                            setIsFalseFlagMode(!isFalseFlagMode);
                                            setIsLockoutMode(false);
                                        }}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || ap < 1}
                                        style={isFalseFlagMode ? { backgroundColor: 'rgba(204, 68, 255, 0.2)', borderColor: '#cc44ff', color: '#cc44ff' } : { borderColor: '#cc44ff', color: '#cc44ff' }}
                                    >
                                        <Eye size={18} /> <span>偽装工作</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP {'->'} 偽装</span>
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
                                    <button
                                        onClick={() => handleAction('PHYSICAL_DESTROY', ((isMurderer || isHacker) && myRole === 'DevOps') ? 0 : 1)}
                                        className="btn-action btn-analyze"
                                        disabled={phase === 'resolve' || (!((isMurderer || isHacker) && myRole === 'DevOps') && ap < 1)}
                                        style={{ borderColor: '#cc44ff', color: '#cc44ff' }}
                                    >
                                        <AlertTriangle size={18} /> <span>ノード・デストラクション</span><span className="ap-cost" style={{ color: '#ffff00' }}>{((isMurderer || isHacker) && myRole === 'DevOps') ? '0AP' : '1AP'} {'->'}BOT破壊</span>
                                    </button>

                                    {/* 新機能: 無効化 (Nullify) */}
                                    <button
                                        onClick={() => handleAction('NULLIFY', 0)}
                                        className={`btn-action ${hasPendingActions ? 'btn-urgent pulse' : 'btn-analyze'}`}
                                        disabled={!hasPendingActions || nullifyUsedThisTurn}
                                        style={hasPendingActions && !nullifyUsedThisTurn ? { backgroundColor: 'rgba(255, 0, 0, 0.2)', borderColor: '#ff0000', color: '#ff0000', fontWeight: 'bold' } : { borderColor: '#555', color: '#555' }}
                                    >
                                        <X size={18} /> <span>パケット無効化 (Nullify)</span>
                                        <span className="ap-cost" style={{ color: '#ffff00' }}>
                                            {nullifyUsedThisTurn ? '使用済' : (hasPendingActions ? '待機中アクション有' : '待機中なし')}
                                        </span>
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
                                        <Database size={18} /> <span>マスキング</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP {'->'} 次LEAK-5%</span>
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
                                        disabled={phase === 'resolve' || ap < 1 || (players.find(p => p.id === socket.id)?.transferUsedThisTurn || false)}
                                        style={isTransferMode ? { backgroundColor: 'rgba(136, 136, 255, 0.2)', borderColor: '#8888ff', color: '#8888ff' } : { borderColor: '#8888ff', color: '#8888ff' }}
                                    >
                                        <RotateCcw size={18} /> <span>リソース・デプロイメント</span><span className="ap-cost" style={{ color: '#8888ff' }}>1AP (残${(players.find(p => p.id === socket.id)?.transferUsedThisTurn || false) ? 0 : 1})</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('RESTORE', 2)}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#ff4444', color: '#ff4444' }}
                                    >
                                        <Zap size={18} /> <span>リストア</span><span className="ap-cost" style={{ color: '#ff4444' }}>2AP {'->'} HP0時復旧</span>
                                    </button>
                                </>
                            )}

                            {myRole === 'インフラリーダー' && (
                                <>
                                    <button onClick={() => handleAction('SKILL_COPY', 1)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Cpu size={18} /> <span>レプリケーション</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP</span>
                                    </button>
                                    <button onClick={() => handleAction('SPEC_UP', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Zap size={18} /> <span>スペックアップ</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} MaxHP 120</span>
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
                                    <button
                                        onClick={() => handleAction('DEPLOY_BOT', ((isMurderer || isHacker) && myRole === 'DevOps') ? 0 : 2)}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || (!((isMurderer || isHacker) && myRole === 'DevOps') && ap < 2) || (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0) >= 1}
                                        style={{ borderColor: '#ffff00', color: '#ffff00' }}
                                    >
                                        <Cpu size={18} /> <span>解析BOT配備</span><span className="ap-cost" style={{ color: '#ffff00' }}>{((isMurderer || isHacker) && myRole === 'DevOps') ? `0AP (残${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})` : `2AP (残${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})`}</span>
                                    </button>
                                </>
                            )}

                            {/* コピーしたスキル（レプリケーション）の起動ボタン */}
                            {copiedSkill && (
                                <button
                                    onClick={() => {
                                        const needsTarget = ['TRACE_LOG', 'PATCH', 'TRANSFER', 'PIPELINE', 'IP_BLOCK'].includes(copiedSkill);
                                        if (needsTarget) {
                                            setIsCopiedSkillMode(!isCopiedSkillMode);
                                        } else {
                                            handleAction(copiedSkill, 1);
                                        }
                                    }}
                                    className="btn-action btn-special"
                                    disabled={phase === 'resolve' || ap < 1}
                                    style={isCopiedSkillMode
                                        ? { backgroundColor: 'rgba(188, 19, 254, 0.2)', borderColor: '#bc13fe', color: '#bc13fe' }
                                        : { borderColor: '#bc13fe', color: '#bc13fe' }}
                                >
                                    <Cpu size={18} /> <span>★ {copiedSkillLabel}</span><span className="ap-cost" style={{ color: '#bc13fe' }}>1AP (コピー)</span>
                                </button>
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
                                disabled={phase === 'resolve' || ap < 2 || (players.find(p => p.id === socket.id)?.malwareUsedThisTurn || 0) >= 1}
                            >
                                <Skull size={18} /> <span>マルウェア</span><span className="ap-cost">2AP (残{1 - (players.find(p => p.id === socket.id)?.malwareUsedThisTurn || 0)})</span>
                            </button>
                            <button
                                onClick={() => handleAction('EXFILTRATE', 1)}
                                className="btn-action btn-hacker-action"
                                disabled={phase === 'resolve' || ap < 1 || (players.find(p => p.id === socket.id)?.exfilUsedThisTurn || 0) >= 3}
                            >
                                <Database size={18} /> <span>持ち出し</span><span className="ap-cost">1AP {'->'} 漏洩+15% (残{3 - (players.find(p => p.id === socket.id)?.exfilUsedThisTurn || 0)})</span>
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
                            {!isMurderer && (
                                <button
                                    onClick={() => handleAction('VIEW_AUDIT_LOG', 1)}
                                    className="btn-action btn-hacker-action"
                                    disabled={phase === 'resolve' || ap < 1}
                                >
                                    <Eye size={18} /> <span>監査(偽装)</span><span className="ap-cost">1AP {'->'} ログ調査(偽装)</span>
                                </button>
                            )}



                            {/* --- 割り当て職業の固有スキル（偽装用） --- */}
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
                                        <Database size={18} /> <span>マスキング</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP {'->'} 次LEAK-5%</span>
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
                                        disabled={phase === 'resolve' || ap < 1 || (players.find(p => p.id === socket.id)?.transferUsedThisTurn || false)}
                                        style={isTransferMode ? { backgroundColor: 'rgba(136, 136, 255, 0.2)', borderColor: '#8888ff', color: '#8888ff' } : { borderColor: '#8888ff', color: '#8888ff' }}
                                    >
                                        <RotateCcw size={18} /> <span>リソース・デプロイメント</span><span className="ap-cost" style={{ color: '#8888ff' }}>1AP (残${(players.find(p => p.id === socket.id)?.transferUsedThisTurn || false) ? 0 : 1})</span>
                                    </button>
                                    <button
                                        onClick={() => handleAction('RESTORE', 2)}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || ap < 2}
                                        style={{ borderColor: '#ff4444', color: '#ff4444' }}
                                    >
                                        <Zap size={18} /> <span>リストア</span><span className="ap-cost" style={{ color: '#ff4444' }}>2AP {'->'} HP0時復旧</span>
                                    </button>
                                </>
                            )}

                            {myRole === 'インフラリーダー' && (
                                <>
                                    <button onClick={() => handleAction('SKILL_COPY', 1)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Cpu size={18} /> <span>レプリケーション</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP</span>
                                    </button>
                                    <button onClick={() => handleAction('SPEC_UP', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Zap size={18} /> <span>スペックアップ</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} MaxHP 120</span>
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
                                    <button
                                        onClick={() => handleAction('DEPLOY_BOT', ((isMurderer || isHacker) && myRole === 'DevOps') ? 0 : 2)}
                                        className="btn-action btn-special"
                                        disabled={phase === 'resolve' || (!((isMurderer || isHacker) && myRole === 'DevOps') && ap < 2) || (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0) >= 1}
                                        style={{ borderColor: '#ffff00', color: '#ffff00' }}
                                    >
                                        <Cpu size={18} /> <span>解析BOT配備</span><span className="ap-cost" style={{ color: '#ffff00' }}>{((isMurderer || isHacker) && myRole === 'DevOps') ? `0AP (残${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})` : `2AP (残${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})`}</span>
                                    </button>
                                </>
                            )}

                            {/* コピーしたスキル（レプリケーション）の起動ボタン */}
                            {copiedSkill && (
                                <button
                                    onClick={() => {
                                        const needsTarget = ['TRACE_LOG', 'PATCH', 'TRANSFER', 'PIPELINE', 'IP_BLOCK'].includes(copiedSkill);
                                        if (needsTarget) {
                                            setIsCopiedSkillMode(!isCopiedSkillMode);
                                        } else {
                                            handleAction(copiedSkill, 1);
                                        }
                                    }}
                                    className="btn-action btn-special"
                                    disabled={phase === 'resolve' || ap < 1}
                                    style={isCopiedSkillMode
                                        ? { backgroundColor: 'rgba(188, 19, 254, 0.2)', borderColor: '#bc13fe', color: '#bc13fe' }
                                        : { borderColor: '#bc13fe', color: '#bc13fe' }}
                                >
                                    <Cpu size={18} /> <span>★ {copiedSkillLabel}</span><span className="ap-cost" style={{ color: '#bc13fe' }}>1AP (コピー)</span>
                                </button>
                            )}

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

            {/* --- Footer Timer (Player) --- */}
            <footer className="timer-footer">
                <div
                    className={`timer-progress-bar ${timeLeft / turnDuration <= 0.2 ? 'urgent' : ''}`}
                    style={{ width: `${(timeLeft / turnDuration) * 100}%` }}
                />
                <div className="timer-text">
                    <span>TURN {turn}/8</span>
                    <span>|</span>
                    <span>{formatTime(timeLeft)}</span>
                    <span>|</span>
                    <span>{getPhaseLabel()}</span>
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
                                                <option key={p.id} value={p.id}>{p.name}</option>
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
                                                <option key={p.id} value={p.id}>{p.name}</option>
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
