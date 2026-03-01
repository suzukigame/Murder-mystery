import React, { useState, useEffect } from 'react';
import {
    Terminal, Shield, AlertTriangle, Zap, Cpu, Eye, Skull, Lock, X, Users,
    Database, Search, RotateCcw, User, LogOut, HelpCircle
} from 'lucide-react';
import { Socket } from 'socket.io-client';
import SkillButton from './SkillButton';
import SkinSelectorModal from './SkinSelectorModal';
import { getSkinImagePath, AVAILABLE_SKINS } from '../data/skins';
import { useAchievements } from '../hooks/useAchievements';
import { LogEntry, TurnPhase, GameResult } from '../types';

interface GameScreenProps {
    socket: Socket;
    myPlayerName: string;
    myRole: string;
    mySecret: string;
    ap: number;
    turn: number;
    timeLeft: number;
    turnDuration: number;
    phase: TurnPhase;
    systemHp: number;
    maxHp: number;
    dataLeak: number;
    evidenceAnalysis: number;
    gameResult: GameResult;
    isHacker: boolean;
    isMurderer: boolean;
    isIsolated: boolean;
    isIpBlocked: boolean;
    players: any[];
    logs: LogEntry[];
    hasPendingActions: boolean;
    nullifyUsedThisTurn: boolean;
    showHackerMenu: boolean;
    setShowHackerMenu: (show: boolean) => void;
    showManual: boolean;
    setShowManual: (show: boolean) => void;
    isAlert: boolean;
    finalMurdererVote: string;
    setFinalMurdererVote: (val: string) => void;
    finalHackerVote: string;
    setFinalHackerVote: (val: string) => void;
    hasSubmittedFinalVote: boolean;
    finalVotedCount: number;
    revealedMurdererName: string | null;

    // Modes
    isTraceMode: boolean; setIsTraceMode: (v: boolean) => void;
    isDdosMode: boolean; setIsDdosMode: (v: boolean) => void;
    isFalseFlagMode: boolean; setIsFalseFlagMode: (v: boolean) => void;
    isLockoutMode: boolean; setIsLockoutMode: (v: boolean) => void;
    isPipelineMode: boolean; setIsPipelineMode: (v: boolean) => void;
    isTransferMode: boolean; setIsTransferMode: (v: boolean) => void;
    isPatchMode: boolean; setIsPatchMode: (v: boolean) => void;
    isIpBlockMode: boolean; setIsIpBlockMode: (v: boolean) => void;
    isCopiedSkillMode: boolean; setIsCopiedSkillMode: (v: boolean) => void;

    copiedSkill: string | null;
    copiedSkillLabel: string | null;

    // Handlers
    handleAction: (name: string, cost: number, targetId?: string) => void;
    handleHackerAction: (name: string, cost: number) => void;
    handleVote: (targetId: string) => void;
    handleCancelVote: () => void;
    handleFinalVoteSubmit: () => void;
    resetGame: () => void;
    forceStart: () => void;
    handleLeave: () => void;
    addLog: (content: string, level?: LogEntry['level']) => void;
    formatTime: (seconds: number) => string;
    getPhaseLabel: () => string;
}

const GameScreen: React.FC<GameScreenProps> = (props) => {
    const {
        socket, myPlayerName, myRole, mySecret, ap, turn, timeLeft, turnDuration, phase,
        systemHp, maxHp, dataLeak, evidenceAnalysis, gameResult, isHacker, isMurderer,
        isIsolated, isIpBlocked, players, logs, hasPendingActions, nullifyUsedThisTurn,
        showHackerMenu, setShowHackerMenu, isAlert,
        finalMurdererVote, setFinalMurdererVote, finalHackerVote, setFinalHackerVote,
        hasSubmittedFinalVote, finalVotedCount, revealedMurdererName,
        isTraceMode, setIsTraceMode, isDdosMode, setIsDdosMode,
        isFalseFlagMode, setIsFalseFlagMode, isLockoutMode, setIsLockoutMode,
        isPipelineMode, setIsPipelineMode, isTransferMode, setIsTransferMode,
        isPatchMode, setIsPatchMode, isIpBlockMode, setIsIpBlockMode,
        isCopiedSkillMode, setIsCopiedSkillMode,
        copiedSkill, copiedSkillLabel,
        handleAction, handleHackerAction, handleVote, handleCancelVote,
        handleFinalVoteSubmit, resetGame, forceStart, handleLeave, addLog,
        formatTime, getPhaseLabel
    } = props;

    const getThemeClass = () => {
        if (isHacker) return 'hacker-theme';
        if (isMurderer) return 'murderer-theme';
        return '';
    };

    // --- Avatar Skin ---
    const [showSkinSelector, setShowSkinSelector] = useState(false);
    const myPlayer = players.find(p => p.id === socket.id);
    const mySkinId = myPlayer?.skinId || 'default_01';

    const handleChangeSkin = (skinId: string) => {
        socket.emit('change_skin', { skinId });
    };

    // --- 実績解放管理 ---
    const { unlockedAchievements, unlockAchievement } = useAchievements();
    const [newUnlocks, setNewUnlocks] = useState<string[]>([]);

    useEffect(() => {
        const handleGameEndStats = (data: {
            result: string;
            turn: number;
            playerStats: Array<{
                playerId: string;
                faction: string;
                won: boolean;
                role: string;
                wasVotedAsMurderer: boolean;
                turn: number;
                firstTurnIsolated: boolean;
            }>;
        }) => {
            const myStats = data.playerStats.find(s => s.playerId === socket.id);
            if (!myStats) return;

            const newlyUnlocked: string[] = [];

            // play_game_5: ゲーム回数のカウント（LocalStorageで管理）
            const gameCountKey = 'nexus_war_game_count';
            const currentCount = parseInt(localStorage.getItem(gameCountKey) || '0', 10) + 1;
            localStorage.setItem(gameCountKey, String(currentCount));
            if (currentCount >= 5) {
                newlyUnlocked.push('play_game_5');
            }

            // win_hacker_1 & win_hacker_3: ハッカーとして勝利（回数カウント）
            if (myStats.faction === 'hacker' && myStats.won) {
                newlyUnlocked.push('win_hacker_1');

                const hackerWinKey = 'nexus_war_hacker_wins';
                const hackerWins = parseInt(localStorage.getItem(hackerWinKey) || '0', 10) + 1;
                localStorage.setItem(hackerWinKey, String(hackerWins));
                if (hackerWins >= 3) {
                    newlyUnlocked.push('win_hacker_3');
                }
            }

            // win_employee_3 & win_employee_5: 社員として勝利（回数カウント）
            if (myStats.faction === 'employee' && myStats.won) {
                const empWinKey = 'nexus_war_employee_wins';
                const empWins = parseInt(localStorage.getItem(empWinKey) || '0', 10) + 1;
                localStorage.setItem(empWinKey, String(empWins));
                if (empWins >= 3) {
                    newlyUnlocked.push('win_employee_3');
                }
                if (empWins >= 5) {
                    newlyUnlocked.push('win_employee_5');
                }
            }

            // win_murderer_1 & win_murderer_3: 殺人犯として勝利（回数カウント）
            if (myStats.faction === 'murderer' && myStats.won) {
                newlyUnlocked.push('win_murderer_1');

                const murdererWinKey = 'nexus_war_murderer_wins';
                const murdererWins = parseInt(localStorage.getItem(murdererWinKey) || '0', 10) + 1;
                localStorage.setItem(murdererWinKey, String(murdererWins));
                if (murdererWins >= 3) {
                    newlyUnlocked.push('win_murderer_3');
                }
            }

            // perfect_win_murderer: 殺人犯として誰にも投票されずに勝利
            if (myStats.faction === 'murderer' && myStats.won && !myStats.wasVotedAsMurderer) {
                newlyUnlocked.push('perfect_win_murderer');
            }

            // first_death: ターン1で判定されて隔離された場合
            if (myStats.firstTurnIsolated) {
                newlyUnlocked.push('first_death');
            }

            // prevent_hack_3: 1ゲーム中にハッカーの攻撃を3回防いだ場合（将来的に拡張）



            // 新規解放の処理
            const actuallyNew = newlyUnlocked.filter(id => !unlockedAchievements.includes(id));
            actuallyNew.forEach(id => unlockAchievement(id));

            if (actuallyNew.length > 0) {
                setNewUnlocks(actuallyNew);
                setTimeout(() => setNewUnlocks([]), 5000);
            }
        };

        socket.on('game_end_stats', handleGameEndStats);
        return () => { socket.off('game_end_stats', handleGameEndStats); };
    }, [socket, unlockedAchievements, unlockAchievement]);

    // --- Helper for Game Over Display ---
    const getGameOverDisplay = (result: GameResult | 'playing') => {
        switch (result) {
            case 'employee_perfect_win':
                return { text: '社員完全勝利', className: 'win' };
            case 'employee_win':
                return { text: '引き分け (業務継続不可)', className: 'draw' };
            case 'murderer_escape':
                return { text: '殺人犯逃走 (社員敗北)', className: 'lose' };
            case 'hacker_win':
                return { text: 'システムダウン (ハッカー勝利)', className: 'lose' };
            default:
                return { text: result, className: '' };
        }
    };

    const gameOverDisplay = getGameOverDisplay(gameResult);

    // ゲーム開始前のロビー表示
    if (!myRole && gameResult === 'playing') {
        return (
            <div className="terminal-screen flex flex-col items-center justify-center min-h-screen w-screen p-4 bg-black text-green-500 font-mono">
                <div className="mb-12 text-center">
                    <h1 className="text-4xl font-bold mb-1 tracking-tighter text-shadow-green uppercase">WAITING FOR OPERATIVES</h1>
                    <p className="text-green-700 tracking-widest text-[10px]">CONNECTED AS: {myPlayerName}</p>
                </div>

                <div className="border border-green-500/50 p-8 rounded bg-black/99 max-w-2xl w-full shadow-[0_0_20px_rgba(0,255,0,0.2)]">
                    <div className="flex justify-between items-center mb-6 border-b border-green-500/30 pb-4">
                        <h2 className="text-lg flex items-center gap-2 text-green-400">
                            <Users size={18} /> 接続済みエージェント
                        </h2>
                        <div className="text-xs text-green-700">{players.length} / 6 ONLINE</div>
                    </div>

                    <div className="lobby-grid mb-8">
                        {players.map(p => (
                            <div
                                key={p.id}
                                className={`lobby-card ${p.id === socket.id ? 'is-me pulse-border' : ''}`}
                                onClick={() => p.id === socket.id && setShowSkinSelector(true)}
                            >
                                <div className="lobby-card-bg">
                                    <img src={getSkinImagePath(p.skinId)} alt="avatar" className="lobby-avatar-img" />
                                </div>
                                <div className="lobby-card-info">
                                    <div className="flex items-center gap-1">
                                        {p.id === socket.id && <Zap size={10} className="text-yellow-400" />}
                                        <span className="lobby-player-name">{p.name}</span>
                                    </div>
                                    <div className="lobby-player-status">
                                        {p.id === socket.id ? 'CLICK TO CHANGE' : 'READY'}
                                    </div>
                                </div>
                                {p.id === socket.id && (
                                    <div className="lobby-you-tag">YOU</div>
                                )}
                            </div>
                        ))}
                        {Array.from({ length: 6 - players.length }).map((_, i) => (
                            <div key={`empty-${i}`} className="lobby-card empty">
                                <div className="lobby-card-empty-content">
                                    <User size={24} className="opacity-20 mb-1" />
                                    <span>WAITING...</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mb-6 p-4 border border-green-500/20 bg-green-500/5 rounded">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-green-400">1ターンの時間設定</span>
                            <select
                                className="bg-black border border-green-500 text-green-400 p-1 text-sm outline-none"
                                value={turnDuration}
                                onChange={(e) => socket.emit('update_settings', { turnDuration: Number(e.target.value) })}
                            >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(min => (
                                    <option key={min} value={min * 60}>{min} 分</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={forceStart}
                            disabled={players.length < 6}
                            className={`flex-1 py-3 font-bold transition-all tracking-widest ${players.length === 6
                                ? 'bg-green-500 text-black hover:bg-green-400 shadow-[0_0_15px_rgba(0,255,0,0.5)]'
                                : 'bg-green-500/10 border border-green-500/30 text-green-500/50 cursor-not-allowed'
                                }`}
                        >
                            {players.length === 6 ? 'START GAME' : 'WAITING FOR 6 PLAYERS...'}
                        </button>
                        <button
                            onClick={handleLeave}
                            className="flex-1 border border-red-900/50 text-red-700 py-3 hover:bg-red-900/10 transition-all text-xs font-bold uppercase"
                        >
                            LEAVE ROOM
                        </button>
                    </div>
                </div>
                {showSkinSelector && (
                    <SkinSelectorModal
                        currentSkinId={mySkinId}
                        unlockedAchievements={unlockedAchievements}
                        onSelect={handleChangeSkin}
                        onClose={() => setShowSkinSelector(false)}
                    />
                )}
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
                <div className="stat-item text-green-400" style={{ fontWeight: 'bold' }}>
                    <Cpu size={14} /> <span>HP: {maxHp > 100 ? `${systemHp}/${maxHp}` : `${systemHp}%`}</span>
                </div>
                <div className="stat-item ap-gauge">
                    <Zap size={14} /> <span>AP: {ap}/{(isHacker || isMurderer) ? 6 : 3}</span>
                </div>
                <div className="stat-item phase-tag">
                    <span>{getPhaseLabel()}</span>
                </div>
                <button
                    onClick={() => props.setShowManual(true)}
                    className="help-btn"
                    style={{ marginLeft: 'auto' }}
                >
                    <HelpCircle size={14} /> <span>ヘルプ</span>
                </button>
                <button onClick={handleLeave} className="stat-item hover:text-red-500 transition-colors flex items-center gap-1">
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

            {isPipelineMode && (
                <div className="absolute top-0 right-full mr-2 z-20 flex flex-col gap-1 w-48 animate-fade-in bg-black/80 backdrop-blur-md p-2 rounded border border-[#00ffff] shadow-[0_0_15px_rgba(0,255,255,0.4)] max-h-48 overflow-y-auto">
                    <div className="text-xs text-[#00ffff] px-2 py-1 flex items-center gap-2">
                        <span>対象選択 (パイプライン)</span>
                    </div>
                    <ul>
                        {players.map(p => (
                            <li key={p.id} className="flex justify-between items-center px-3 py-1 text-sm bg-white/5 hover:bg-[#00ffff]/20 text-[#00ffff] rounded transition-colors whitespace-nowrap overflow-hidden text-ellipsis">
                                <span>{p.name} {p.role && `[${p.role}]`}</span>
                                <div className="flex gap-1">
                                    <button onClick={() => setIsPipelineMode(false)} className="btn-vote" disabled={phase === 'resolve'} style={{ backgroundColor: 'rgba(255,68,68,0.15)', borderColor: '#ff4444', color: '#ff8888', fontSize: '0.7rem', padding: '2px 6px' }}>CANCEL</button>
                                    <button onClick={() => {
                                        handleAction('PIPELINE', 1, p.id);
                                        setIsPipelineMode(false);
                                    }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#00ffff', color: '#00ffff' }}>CONNECT</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

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
                                    <img src={getSkinImagePath(p.skinId)} alt="avatar" className="avatar-icon" />
                                    <div>
                                        <div className="p-name">{p.name}</div>
                                        {p.votes > 0 && <div className="p-votes">疑惑度: {p.votes}</div>}
                                    </div>
                                </div>
                                {p.id !== socket.id && (
                                    <>
                                        {!isTraceMode && !isDdosMode && !isFalseFlagMode && !isLockoutMode && !isPipelineMode && !isTransferMode && !isPatchMode && !isIpBlockMode && !isCopiedSkillMode && (
                                            <div className="flex gap-1">
                                                <button onClick={() => handleVote(p.id)} className="btn-vote" disabled={phase === 'resolve'}>投票</button>
                                                <button onClick={() => handleCancelVote()} className="btn-vote" disabled={phase === 'resolve'} style={{ backgroundColor: 'rgba(255,68,68,0.15)', borderColor: '#ff4444', color: '#ff8888', fontSize: '0.7rem', padding: '2px 6px' }}>取消</button>
                                            </div>
                                        )}
                                        {isTraceMode && myRole === 'ネットワーク管理者' && (
                                            <button onClick={() => { handleAction('TRACE_LOG', 1, p.id); setIsTraceMode(false); }} className="btn-vote btn-trace" disabled={phase === 'resolve'} style={{ borderColor: '#ffff00', color: '#ffff00' }}>TRACE</button>
                                        )}
                                        {isDdosMode && isHacker && (
                                            <button onClick={() => { handleAction('DDOS', 1, p.id); setIsDdosMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#ff4444', color: '#ff4444' }}>DDOS</button>
                                        )}
                                        {(isFalseFlagMode && (isHacker || isMurderer)) && (
                                            <button onClick={() => { handleAction('FALSE_FLAG', 1, p.id); setIsFalseFlagMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#ff00ff', color: '#ff00ff' }}>FAKE</button>
                                        )}
                                        {isLockoutMode && isMurderer && (
                                            <button onClick={() => { handleAction('LOCKOUT', 2, p.id); setIsLockoutMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#ff0000', color: '#ff0000' }}>LOCK</button>
                                        )}
                                        {isPipelineMode && myRole === 'DevOps' && (
                                            <button onClick={() => { handleAction('PIPELINE', 1, p.id); setIsPipelineMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#00ffff', color: '#00ffff' }}>CONNECT</button>
                                        )}
                                        {isTransferMode && myRole === 'システムオペレーター' && (
                                            <button onClick={() => { handleAction('TRANSFER', 1, p.id); setIsTransferMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#8888ff', color: '#8888ff' }}>GIVE AP</button>
                                        )}
                                        {isPatchMode && myRole === 'セキュリティ分析官' && (
                                            <button onClick={() => { handleAction('PATCH', 1, p.id); setIsPatchMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#00ff88', color: '#00ff88' }}>PATCH</button>
                                        )}
                                        {isIpBlockMode && myRole === 'ネットワーク管理者' && (
                                            <button onClick={() => { handleAction('IP_BLOCK', 2, p.id); setIsIpBlockMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#ff4444', color: '#ff4444' }}>BLOCK</button>
                                        )}
                                        {isCopiedSkillMode && copiedSkill && (
                                            <button onClick={() => { handleAction(copiedSkill, 1, p.id); setIsCopiedSkillMode(false); }} className="btn-vote" disabled={phase === 'resolve'} style={{ borderColor: '#bc13fe', color: '#bc13fe' }}>USE SKILL</button>
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
                        <div className="action-grid">
                            {!isMurderer && (
                                <>
                                    <SkillButton tooltip="2AP: サーバーHPを10回復する。" onClick={() => handleAction('RESTORE_SYSTEM', 2)} className="btn-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Shield size={18} /> <span>システム修復</span><span className="ap-cost">2AP {'->'} HP+10</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: データ漏洩率を10%低減する。" onClick={() => handleAction('ENCRYPT_DATA', 2)} className="btn-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Lock size={18} /> <span>データ暗号化</span><span className="ap-cost">2AP {'->'} 漏洩-10%</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 証拠解析を10%進行させる。殺人犯が使用した場合は進行しない。" onClick={() => handleAction('ANALYZE_EVIDENCE', 2)} className="btn-action btn-analyze" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Search size={18} /> <span>証拠解析</span><span className="ap-cost">2AP {'->'} 解析+10%</span>
                                    </SkillButton>
                                </>
                            )}
                            {!isMurderer && (
                                <SkillButton tooltip="1AP: 前ターンの攻撃・工作行動の件数を確認できる。結果は自分にのみ通知。" onClick={() => handleAction('VIEW_AUDIT_LOG', 1)} className="btn-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                    <Eye size={18} /> <span>監査ログ</span><span className="ap-cost">1AP</span>
                                </SkillButton>
                            )}

                            {isMurderer && (
                                <>
                                    <SkillButton tooltip="1AP: サーバーHPを5低下させる。FW発動時はブロックされる。痕跡が残る。" onClick={() => handleAction('SABOTAGE', 1)} className="btn-action btn-analyze" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Skull size={18} /> <span>サボタージュ</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP {'->'} HP-5</span>
                                    </SkillButton>
                                    <SkillButton tooltip="1AP: 証拠解析率を5%低下させる。痕跡が残る。" onClick={() => handleAction('TAMPER_EVIDENCE', 1)} className="btn-action btn-analyze" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Database size={18} /> <span>証拠改ざん</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP {'->'} 解析-5%</span>
                                    </SkillButton>
                                    <SkillButton tooltip="1AP: 対象のログ追跡結果をPOSITIVE(黒)に偽装する。" onClick={() => { setIsFalseFlagMode(!isFalseFlagMode); setIsLockoutMode(false); }} className="btn-action btn-analyze" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isFalseFlagMode ? { backgroundColor: 'rgba(204, 68, 255, 0.2)', borderColor: '#cc44ff', color: '#cc44ff' } : { borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Eye size={18} /> <span>偽装工作</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP {'->'} 偽装</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 次ターンの議論フェーズ時間を半減する。" onClick={() => handleAction('BLACKOUT', 2)} className="btn-action btn-analyze" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Zap size={18} /> <span>停電工作</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} 議論半減</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 対象の次ターンAPを-3する。FW発動時はブロック。" onClick={() => { setIsLockoutMode(!isLockoutMode); setIsFalseFlagMode(false); }} className="btn-action btn-analyze" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={isLockoutMode ? { backgroundColor: 'rgba(204, 68, 255, 0.2)', borderColor: '#cc44ff', color: '#cc44ff' } : { borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Lock size={18} /> <span>ロックアウト</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} 行動封鎖</span>
                                    </SkillButton>
                                    <SkillButton tooltip="1AP(DevOps時0AP): 稼働中の解析BOTを1台破壊する。" onClick={() => handleAction('PHYSICAL_DESTROY', ((isMurderer || isHacker) && myRole === 'DevOps') ? 0 : 1)} className="btn-action btn-analyze" disabled={isIsolated || isIpBlocked || phase === 'resolve' || (!((isMurderer || isHacker) && myRole === 'DevOps') && ap < 1)} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <AlertTriangle size={18} /> <span>ノード・デストラクション</span><span className="ap-cost" style={{ color: '#ffff00' }}>{((isMurderer || isHacker) && myRole === 'DevOps') ? '0AP' : '1AP'} {'->'} BOT破壊</span>
                                    </SkillButton>
                                    <SkillButton tooltip="0AP: 待機中のアクションを1つ無効化する。ターン1回。" onClick={() => handleAction('NULLIFY', 0)} className={`btn-action ${hasPendingActions ? 'btn-urgent pulse' : 'btn-analyze'}`} disabled={isIsolated || isIpBlocked || !hasPendingActions || nullifyUsedThisTurn} style={hasPendingActions && !nullifyUsedThisTurn ? { backgroundColor: 'rgba(255, 0, 0, 0.2)', borderColor: '#ff0000', color: '#ff0000', fontWeight: 'bold' } : { borderColor: '#555', color: '#555' }}>
                                        <X size={18} /> <span>パケット無効化 (Nullify)</span>
                                        <span className="ap-cost" style={{ color: '#ffff00' }}>
                                            {nullifyUsedThisTurn ? '使用済' : (hasPendingActions ? '待機中アクション有' : '待機中なし')}
                                        </span>
                                    </SkillButton>
                                </>
                            )}

                            {/* Role Specifics */}
                            {myRole === 'ネットワーク管理者' && (
                                <>
                                    <SkillButton tooltip="1AP: 対象が前ターンにハッカー行動をしたか調査(白/黒)。結果は自分にのみ通知。" onClick={() => { setIsTraceMode(!isTraceMode); setIsIpBlockMode(false); }} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isTraceMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)', borderColor: '#ffff00', color: '#ffff00' } : { borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Search size={18} /> <span>ログ追跡</span><span className="ap-cost" style={{ color: '#ffff00' }}>1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 対象の次ターンのアクションを封じる。" onClick={() => { setIsIpBlockMode(!isIpBlockMode); setIsTraceMode(false); }} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={isIpBlockMode ? { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}>
                                        <Lock size={18} /> <span>IPブロック</span><span className="ap-cost" style={{ color: '#ff4444' }}>2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'セキュリティ分析官' && (
                                <>
                                    <SkillButton tooltip="1AP: 対象へのデバフ(DDOS等)を無効化する。" onClick={() => setIsPatchMode(!isPatchMode)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isPatchMode ? { backgroundColor: 'rgba(0, 255, 136, 0.2)', borderColor: '#00ff88', color: '#00ff88' } : { borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Shield size={18} /> <span>パッチ適用</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 次の攻撃(1回)をブロックする。破壊されるまで持続。" onClick={() => handleAction('FIREWALL', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Shield size={18} /> <span>ファイアウォール</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'DBエンジニア' && (
                                <>
                                    <SkillButton tooltip="1AP: 次回のデータ持ち出し時の漏洩量を5%軽減する。" onClick={() => handleAction('MASKING', 1)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Database size={18} /> <span>マスキング</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP {'->'} 次LEAK-5%</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 次のデータ持ち出し実行者の名前を特定するトラップ。" onClick={() => handleAction('HONEY_POT', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Database size={18} /> <span>ハニーポット</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'システムオペレーター' && (
                                <>
                                    <SkillButton tooltip="1AP: 対象の次ターンAPを+1する。ターン1回。" onClick={() => setIsTransferMode(!isTransferMode)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1 || (players.find(p => p.id === socket.id)?.transferUsedThisTurn || false)} style={isTransferMode ? { backgroundColor: 'rgba(136, 136, 255, 0.2)', borderColor: '#8888ff', color: '#8888ff' } : { borderColor: '#8888ff', color: '#8888ff' }}>
                                        <RotateCcw size={18} /> <span>リソース・デプロイメント</span><span className="ap-cost" style={{ color: '#8888ff' }}>1AP (残:{(players.find(p => p.id === socket.id)?.transferUsedThisTurn || false) ? 0 : 1})</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: サーバーHP=0時に自動でHP20に復旧するプロトコルをセット。" onClick={() => handleAction('RESTORE', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#ff4444', color: '#ff4444' }}>
                                        <Zap size={18} /> <span>リストア</span><span className="ap-cost" style={{ color: '#ff4444' }}>2AP {'->'} HP0時復旧</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'インフラリーダー' && (
                                <>
                                    <SkillButton tooltip="1AP: 他業種のスキルをランダムに1つ複製(1回限り使用可能)。" onClick={() => handleAction('SKILL_COPY', 1)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Cpu size={18} /> <span>レプリケーション</span><span className="ap-cost" style={{ color: '#00ff88' }}>1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: サーバーHP上限を120に拡張(2ターン持続)。" onClick={() => handleAction('SPEC_UP', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Zap size={18} /> <span>スペックアップ</span><span className="ap-cost" style={{ color: '#ffff00' }}>2AP {'->'} MaxHP 120</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'DevOps' && (
                                <>
                                    <SkillButton tooltip="1AP: 指定した対象が証拠解析を行うとBOT機数が解析度にボーナス加算される。" onClick={() => setIsPipelineMode(!isPipelineMode)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isPipelineMode ? { backgroundColor: 'rgba(0, 255, 255, 0.2)', borderColor: '#00ffff', color: '#00ffff' } : { borderColor: '#00ffff', color: '#00ffff' }}>
                                        <Cpu size={18} /> <span>CI/CDパイプライン</span><span className="ap-cost" style={{ color: '#00ffff' }}>1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP(犯人側DevOps時0AP): 解析BOTを1台配備(最大3)。ターン1回。" onClick={() => handleAction('DEPLOY_BOT', ((isMurderer || isHacker) && myRole === 'DevOps') ? 0 : 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || (!((isMurderer || isHacker) && myRole === 'DevOps') && ap < 2) || (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0) >= 1} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Cpu size={18} /> <span>解析BOT配備</span><span className="ap-cost" style={{ color: '#ffff00' }}>{((isMurderer || isHacker) && myRole === 'DevOps') ? `0AP (残:${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})` : `2AP (残:${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})`}</span>
                                    </SkillButton>
                                </>
                            )}

                            {/* Copied Skill */}
                            {copiedSkill && (
                                <SkillButton tooltip={`1AP: レプリケーションで複製したスキルを使用する(1回限り)。`} onClick={() => { const needsTarget = ['TRACE_LOG', 'PATCH', 'TRANSFER', 'PIPELINE', 'IP_BLOCK'].includes(copiedSkill); if (needsTarget) setIsCopiedSkillMode(!isCopiedSkillMode); else handleAction(copiedSkill, 1); }} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isCopiedSkillMode ? { backgroundColor: 'rgba(188, 19, 254, 0.2)', borderColor: '#bc13fe', color: '#bc13fe' } : { borderColor: '#bc13fe', color: '#bc13fe' }}>
                                    <Cpu size={18} /> <span>★ {copiedSkillLabel}</span><span className="ap-cost" style={{ color: '#bc13fe' }}>1AP (コピー)</span>
                                </SkillButton>
                            )}

                            <SkillButton
                                tooltip="現在のサーバーHP、データ漏洩率、残りAPをログに表示する。"
                                onClick={() => addLog(`STATUS: HP=${systemHp}% | LEAK=${dataLeak}% | AP=${ap}/${(isHacker || isMurderer) ? 6 : 3}`, 'info')}
                                className="btn-action btn-status"
                            >
                                <AlertTriangle size={18} /> <span>ステータス</span>
                            </SkillButton>
                        </div>
                    ) : (
                        <div className="action-grid hacker-grid">
                            <SkillButton tooltip="2AP: 1ターンに1回。サーバーHPを45低下またはデータ漏洩を15%加算させる(ランダム)。" onClick={() => handleAction('INJECT_MALWARE', 2)} className="btn-action btn-hacker-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2 || (players.find(p => p.id === socket.id)?.malwareUsedThisTurn || 0) >= 1}>
                                <Skull size={18} /> <span>マルウェア</span><span className="ap-cost">2AP (残:{1 - (players.find(p => p.id === socket.id)?.malwareUsedThisTurn || 0)})</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: 1ターン3回まで。データ漏洩率を15%加算させる。" onClick={() => handleAction('EXFILTRATE', 1)} className="btn-action btn-hacker-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1 || (players.find(p => p.id === socket.id)?.exfilUsedThisTurn || 0) >= 3}>
                                <Database size={18} /> <span>持ち出し</span><span className="ap-cost">1AP {'->'} 漏洩+15% (残:{3 - (players.find(p => p.id === socket.id)?.exfilUsedThisTurn || 0)})</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: 自分が残した判定の痕跡(NEGATIVEログ)を全て抹消する。" onClick={() => handleAction('COVER_TRACKS', 1)} className="btn-action btn-hacker-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1}>
                                <Lock size={18} /> <span>痕跡消去</span><span className="ap-cost">1AP {'->'} 痕跡抹消</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: 対象の次ターンAPを-2する。対象が'パッチ適用'されていると無効。" onClick={() => { setIsDdosMode(!isDdosMode); setIsFalseFlagMode(false); }} className="btn-action btn-hacker-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isDdosMode ? { backgroundColor: 'rgba(255, 68, 68, 0.3)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}>
                                <Zap size={18} /> <span>DDOS攻撃</span><span className="ap-cost">1AP {'->'} AP-2</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: 対象の次ターンのログ結果をPOSITIVE(白)に偽装する。" onClick={() => { setIsFalseFlagMode(!isFalseFlagMode); setIsDdosMode(false); }} className="btn-action btn-hacker-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isFalseFlagMode ? { backgroundColor: 'rgba(255, 68, 68, 0.3)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}>
                                <AlertTriangle size={18} /> <span>偽装工作</span><span className="ap-cost">1AP {'->'} POSITIVE偽装</span>
                            </SkillButton>
                            {!isMurderer && (
                                <SkillButton tooltip="1AP: (偽装用)ログ調査をするふりをする。痕跡として残る。" onClick={() => handleAction('VIEW_AUDIT_LOG', 1)} className="btn-action btn-hacker-action" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1}>
                                    <Eye size={18} /> <span>監査ログ</span><span className="ap-cost">1AP</span>
                                </SkillButton>
                            )}

                            {/* ハッカー用ジョブ固有スキル */}
                            {myRole === 'ネットワーク管理者' && (
                                <>
                                    <SkillButton tooltip="1AP: 対象が前ターンにハッカー行動をしたか調査(白/黒)。結果は自分にのみ通知。" onClick={() => { setIsTraceMode(!isTraceMode); setIsIpBlockMode(false); }} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isTraceMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)' } : {}}>
                                        <Search size={18} /> <span>ログ追跡</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 対象の次ターンのアクションを封じる。" onClick={() => { setIsIpBlockMode(!isIpBlockMode); setIsTraceMode(false); }} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2} style={isIpBlockMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)' } : {}}>
                                        <Lock size={18} /> <span>IPブロック</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'セキュリティ分析官' && (
                                <>
                                    <SkillButton tooltip="1AP: 対象へのデバフ(DDOS等)を無効化する。" onClick={() => setIsPatchMode(!isPatchMode)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isPatchMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)' } : {}}>
                                        <Shield size={18} /> <span>パッチ適用</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 次の攻撃(1回)をブロックする。破壊されるまで持続。" onClick={() => handleAction('FIREWALL', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2}>
                                        <Shield size={18} /> <span>ファイアウォール</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'DBエンジニア' && (
                                <>
                                    <SkillButton tooltip="1AP: 次回のデータ持ち出し時の漏洩量を5%軽減する。" onClick={() => handleAction('MASKING', 1)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1}>
                                        <Database size={18} /> <span>マスキング</span><span className="ap-cost">1AP {'->'} 次LEAK-5%</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 次のデータ持ち出し実行者の名前を特定するトラップ。" onClick={() => handleAction('HONEY_POT', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2}>
                                        <Database size={18} /> <span>ハニーポット</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'システムオペレーター' && (
                                <>
                                    <SkillButton tooltip="1AP: 対象の次ターンAPを+1する。ターン1回。" onClick={() => setIsTransferMode(!isTransferMode)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1 || (players.find(p => p.id === socket.id)?.transferUsedThisTurn || false)} style={isTransferMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)' } : {}}>
                                        <RotateCcw size={18} /> <span>リソース・デプロイメント</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: サーバーHP=0時に自動でHP20に復旧するプロトコルをセット。" onClick={() => handleAction('RESTORE', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2}>
                                        <Zap size={18} /> <span>リストア</span><span className="ap-cost">2AP {'->'} HP0時復旧</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'インフラリーダー' && (
                                <>
                                    <SkillButton tooltip="1AP: 他業種のスキルをランダムに1つ複製(1回限り使用可能)。" onClick={() => handleAction('SKILL_COPY', 1)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1}>
                                        <Cpu size={18} /> <span>レプリケーション</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: サーバーHP上限を120に拡張(2ターン持続)。" onClick={() => handleAction('SPEC_UP', 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 2}>
                                        <Zap size={18} /> <span>スペックアップ</span><span className="ap-cost">2AP {'->'} MaxHP 120</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'DevOps' && (
                                <>
                                    <SkillButton tooltip="1AP: (偽装用)パイプライン構築のふりをする。対象を選ぶ。" onClick={() => setIsPipelineMode(!isPipelineMode)} className="btn-action btn-hacker-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isPipelineMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)' } : {}}>
                                        <Cpu size={18} /> <span>CI/CDパイプライン偽装</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP(犯人側DevOps時0AP): 解析BOTを1台配備(最大3)。ターン1回。" onClick={() => handleAction('DEPLOY_BOT', ((isMurderer || isHacker) && myRole === 'DevOps') ? 0 : 2)} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || (!((isMurderer || isHacker) && myRole === 'DevOps') && ap < 2) || (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0) >= 1}>
                                        <Cpu size={18} /> <span>解析BOT配備</span><span className="ap-cost">{((isMurderer || isHacker) && myRole === 'DevOps') ? `0AP (残:${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})` : `2AP (残:${1 - (players.find(p => p.id === socket.id)?.deployBotUsedThisTurn || 0)})`}</span>
                                    </SkillButton>
                                </>
                            )}

                            {/* Copied Skill (Hacker) */}
                            {copiedSkill && (
                                <SkillButton tooltip={`1AP: レプリケーションで複製したスキルを使用する(1回限り)。`} onClick={() => { const needsTarget = ['TRACE_LOG', 'PATCH', 'TRANSFER', 'PIPELINE', 'IP_BLOCK'].includes(copiedSkill); if (needsTarget) setIsCopiedSkillMode(!isCopiedSkillMode); else handleAction(copiedSkill, 1); }} className="btn-action btn-special" disabled={isIsolated || isIpBlocked || phase === 'resolve' || ap < 1} style={isCopiedSkillMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)' } : {}}>
                                    <Cpu size={18} /> <span>★ {copiedSkillLabel}</span><span className="ap-cost">1AP (コピー)</span>
                                </SkillButton>
                            )}

                            <SkillButton
                                tooltip="ステータス(偽)。"
                                onClick={() => addLog(`STATUS (FAKE): HP=正常 | LEAK=安全`, 'info')}
                                className="btn-action btn-hacker-action"
                            >
                                <AlertTriangle size={18} /> <span>ステータス</span>
                            </SkillButton>
                        </div>
                    )}
                </section>
            </main>

            {/* --- Footer Timer --- */}
            <footer className="timer-footer">
                <div className={`timer-progress-bar ${timeLeft / turnDuration <= 0.2 ? 'urgent' : ''}`} style={{ width: `${(timeLeft / turnDuration) * 100}%` }} />
                <div className="timer-text">
                    <span>TURN {turn}/8 | {formatTime(timeLeft)} | {getPhaseLabel()}</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                    <button onClick={forceStart} className="btn-debug"><Zap size={10} /> FORCE START</button>
                    <button onClick={resetGame} className="btn-debug"><RotateCcw size={10} /> RESET</button>
                </div>
            </footer>

            {/* --- Modals --- */}
            {
                showHackerMenu && (
                    <div className="modal-overlay" onClick={() => setShowHackerMenu(false)}>
                        <div className="hacker-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header hacker-header">
                                <Skull size={16} /> <span>ROOT ACCESS</span>
                                <button className="modal-close" onClick={() => setShowHackerMenu(false)}><X size={14} /></button>
                            </div>
                            <div className="hacker-actions">
                                <button onClick={() => handleHackerAction('INJECT_MALWARE', 2)} className="btn-hacker-action">マルウェア(2AP)</button>
                                <button onClick={() => handleHackerAction('EXFILTRATE', 1)} className="btn-hacker-action">データ持出(1AP)</button>
                                <button onClick={() => handleHackerAction('COVER_TRACKS', 1)} className="btn-hacker-action">痕跡消去(1AP)</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                phase === 'final_voting' && gameResult === 'playing' && (
                    <div className="modal-overlay game-over-overlay">
                        <div className="game-over-modal" style={{ maxWidth: '400px' }}>
                            <h2 className="game-over-title win">最終告発</h2>
                            {!hasSubmittedFinalVote ? (
                                <div className="flex flex-col gap-4 p-4">
                                    <select value={finalMurdererVote} onChange={e => setFinalMurdererVote(e.target.value)} className="bg-black border border-red-500 p-2 text-sm text-white">
                                        <option value="">-- 殺人犯 --</option>
                                        {players.filter(p => p.id !== socket.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <select value={finalHackerVote} onChange={e => setFinalHackerVote(e.target.value)} className="bg-black border border-green-500 p-2 text-sm text-white">
                                        <option value="">-- ハッカー --</option>
                                        {players.filter(p => p.id !== socket.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <button onClick={handleFinalVoteSubmit} disabled={isIsolated || isIpBlocked || !finalMurdererVote || !finalHackerVote} className="bg-green-600 py-2 font-bold disabled:opacity-30">告発</button>
                                </div>
                            ) : (
                                <div className="p-4 text-center">
                                    <p className="text-green-400">✓ 告発完了</p>
                                    <p className="text-xs text-gray-500">待機中... ({finalVotedCount}/{players.length})</p>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {
                gameResult !== 'playing' && (
                    <div className="modal-overlay game-over-overlay">
                        <div className="game-over-modal">
                            <h2 className={`game-over-title ${gameOverDisplay.className}`}>{gameOverDisplay.text}</h2>
                            <div className="game-over-stats px-8 py-4">
                                <div className="flex justify-between"><span>HP:</span><span>{systemHp}%</span></div>
                                <div className="flex justify-between"><span>LEAK:</span><span>{dataLeak}%</span></div>
                                <div className="flex justify-between"><span>TURN:</span><span>{turn}</span></div>
                            </div>
                            <button className="btn-restart" onClick={resetGame}><RotateCcw size={16} /> ミッション再開</button>
                        </div>
                    </div>
                )
            }
            {showSkinSelector && (
                <SkinSelectorModal
                    currentSkinId={mySkinId}
                    unlockedAchievements={unlockedAchievements}
                    onSelect={handleChangeSkin}
                    onClose={() => setShowSkinSelector(false)}
                />
            )}
            {newUnlocks.length > 0 && (
                <div className="unlock-toast">
                    <div className="unlock-toast-icon">🔓</div>
                    <div className="unlock-toast-text">
                        <strong>NEW CHARACTER UNLOCKED!</strong>
                        {newUnlocks.map(condId => {
                            const skin = AVAILABLE_SKINS.find(s => s.unlockCondition === condId);
                            return <div key={condId}>{skin ? skin.name : condId}</div>;
                        })}
                    </div>
                </div>
            )}
        </div >
    );
};

export default GameScreen;
