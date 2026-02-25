import React from 'react';
import {
    Terminal, Shield, AlertTriangle, Zap, Cpu, Eye, Skull, Lock, X, Users,
    Database, Search, RotateCcw, User, LogOut, HelpCircle
} from 'lucide-react';
import { Socket } from 'socket.io-client';
import SkillButton from './SkillButton';
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
        isIsolated, players, logs, hasPendingActions, nullifyUsedThisTurn,
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

                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {players.map(p => (
                            <div key={p.id} className="p-3 border border-green-500/20 bg-green-500/5 rounded flex justify-between items-center">
                                <span className="text-sm">{p.name}</span>
                                {p.id === socket.id && <span className="text-[8px] bg-green-500 text-black px-1 rounded">YOU</span>}
                            </div>
                        ))}
                        {Array.from({ length: 6 - players.length }).map((_, i) => (
                            <div key={`empty-${i}`} className="p-3 border border-dashed border-green-900/30 rounded text-green-900 text-xs text-center">
                                WAITING...
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={forceStart}
                            className="flex-1 bg-green-500/20 border border-green-500 text-green-400 py-3 font-bold hover:bg-green-500 hover:text-black transition-all tracking-widest"
                        >
                            FORCE START
                        </button>
                        <button
                            onClick={handleLeave}
                            className="flex-1 border border-red-900/50 text-red-700 py-3 hover:bg-red-900/10 transition-all text-xs font-bold uppercase"
                        >
                            LEAVE ROOM
                        </button>
                    </div>
                </div>
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
                                    <div className="p-name">{p.name}</div>
                                    {p.votes > 0 && <div className="p-votes">疑惑度: {p.votes}</div>}
                                </div>
                                {p.id !== socket.id && (
                                    <>
                                        {!isTraceMode && !isDdosMode && !isFalseFlagMode && !isLockoutMode && !isPipelineMode && !isTransferMode && !isPatchMode && !isIpBlockMode && !isCopiedSkillMode && (
                                            <div className="flex gap-1">
                                                <button onClick={() => handleVote(p.id)} className="btn-vote">投票</button>
                                                <button onClick={() => handleCancelVote()} className="btn-vote" style={{ backgroundColor: 'rgba(255,68,68,0.15)', borderColor: '#ff4444', color: '#ff8888', fontSize: '0.7rem', padding: '2px 6px' }}>取消</button>
                                            </div>
                                        )}
                                        {isTraceMode && myRole === 'ネットワーク管理者' && (
                                            <button onClick={() => { handleAction('TRACE_LOG', 1, p.id); setIsTraceMode(false); }} className="btn-vote btn-trace" style={{ borderColor: '#ffff00', color: '#ffff00' }}>TRACE</button>
                                        )}
                                        {isDdosMode && isHacker && (
                                            <button onClick={() => { handleAction('DDOS', 1, p.id); setIsDdosMode(false); }} className="btn-vote" style={{ borderColor: '#ff4444', color: '#ff4444' }}>DDOS</button>
                                        )}
                                        {(isFalseFlagMode && (isHacker || isMurderer)) && (
                                            <button onClick={() => { handleAction('FALSE_FLAG', 1, p.id); setIsFalseFlagMode(false); }} className="btn-vote" style={{ borderColor: '#ff00ff', color: '#ff00ff' }}>FAKE</button>
                                        )}
                                        {isLockoutMode && isMurderer && (
                                            <button onClick={() => { handleAction('LOCKOUT', 2, p.id); setIsLockoutMode(false); }} className="btn-vote" style={{ borderColor: '#ff0000', color: '#ff0000' }}>LOCK</button>
                                        )}
                                        {isPipelineMode && myRole === 'DevOps' && (
                                            <button onClick={() => { handleAction('PIPELINE', 1, p.id); setIsPipelineMode(false); }} className="btn-vote" style={{ borderColor: '#00ffff', color: '#00ffff' }}>CONNECT</button>
                                        )}
                                        {isTransferMode && myRole === 'システムオペレーター' && (
                                            <button onClick={() => { handleAction('TRANSFER', 1, p.id); setIsTransferMode(false); }} className="btn-vote" style={{ borderColor: '#8888ff', color: '#8888ff' }}>GIVE AP</button>
                                        )}
                                        {isPatchMode && myRole === 'セキュリティ分析官' && (
                                            <button onClick={() => { handleAction('PATCH', 1, p.id); setIsPatchMode(false); }} className="btn-vote" style={{ borderColor: '#00ff88', color: '#00ff88' }}>PATCH</button>
                                        )}
                                        {isIpBlockMode && myRole === 'ネットワーク管理者' && (
                                            <button onClick={() => { handleAction('IP_BLOCK', 2, p.id); setIsIpBlockMode(false); }} className="btn-vote" style={{ borderColor: '#ff4444', color: '#ff4444' }}>BLOCK</button>
                                        )}
                                        {isCopiedSkillMode && copiedSkill && (
                                            <button onClick={() => { handleAction(copiedSkill, 1, p.id); setIsCopiedSkillMode(false); }} className="btn-vote" style={{ borderColor: '#bc13fe', color: '#bc13fe' }}>USE SKILL</button>
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
                                    <SkillButton tooltip="2AP: サーバーHPを10回復する。" onClick={() => handleAction('RESTORE_SYSTEM', 2)} className="btn-action" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Shield size={18} /> <span>システム修復</span><span className="ap-cost">2AP {'->'} HP+10</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: データ漏洩率を10%低減する。" onClick={() => handleAction('ENCRYPT_DATA', 2)} className="btn-action" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Lock size={18} /> <span>データ暗号化</span><span className="ap-cost">2AP {'->'} 漏洩-10%</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 証拠解析を10%進行させる。殺人犯が使用した場合は進行しない。" onClick={() => handleAction('ANALYZE_EVIDENCE', 2)} className="btn-action btn-analyze" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Search size={18} /> <span>証拠解析</span><span className="ap-cost">2AP {'->'} 解析+10%</span>
                                    </SkillButton>
                                    <SkillButton tooltip="1AP: 前ターンの攻撃・工作行動の件数を確認できる。" onClick={() => handleAction('VIEW_AUDIT_LOG', 1)} className="btn-action" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Eye size={18} /> <span>監査ログ</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                </>
                            )}

                            {isMurderer && (
                                <>
                                    <SkillButton tooltip="1AP: サーバーHPを5減少させる。" onClick={() => handleAction('SABOTAGE', 1)} className="btn-action" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Skull size={18} /> <span>サボタージュ</span><span className="ap-cost">1AP {'->'} HP-5</span>
                                    </SkillButton>
                                    <SkillButton tooltip="1AP: 証拠解析率を5%減少させる。" onClick={() => handleAction('TAMPER_EVIDENCE', 1)} className="btn-action" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Database size={18} /> <span>証拠改ざん</span><span className="ap-cost">1AP {'->'} 解析-5%</span>
                                    </SkillButton>
                                    <SkillButton tooltip="1AP: ログ追跡を偽装する。" onClick={() => { setIsFalseFlagMode(!isFalseFlagMode); setIsLockoutMode(false); }} className="btn-action" disabled={phase === 'resolve' || ap < 1} style={isFalseFlagMode ? { backgroundColor: 'rgba(204, 68, 255, 0.2)', borderColor: '#cc44ff', color: '#cc44ff' } : { borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Eye size={18} /> <span>偽装工作</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 議論フェーズを短縮する。" onClick={() => handleAction('BLACKOUT', 2)} className="btn-action" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Zap size={18} /> <span>停電工作</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 対象の次ターンAPを-3。封鎖。" onClick={() => { setIsLockoutMode(!isLockoutMode); setIsFalseFlagMode(false); }} className="btn-action" disabled={phase === 'resolve' || ap < 2} style={isLockoutMode ? { backgroundColor: 'rgba(204, 68, 255, 0.2)', borderColor: '#cc44ff', color: '#cc44ff' } : { borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <Lock size={18} /> <span>ロックアウト</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="1AP: 解析BOTを破壊。" onClick={() => handleAction('PHYSICAL_DESTROY', myRole === 'DevOps' ? 0 : 1)} className="btn-action" disabled={phase === 'resolve' || (myRole !== 'DevOps' && ap < 1)} style={{ borderColor: '#cc44ff', color: '#cc44ff' }}>
                                        <AlertTriangle size={18} /> <span>ノード破壊</span><span className="ap-cost">{myRole === 'DevOps' ? '0AP' : '1AP'}</span>
                                    </SkillButton>
                                    <SkillButton tooltip="0AP: 待機アクション無効。1回/T。" onClick={() => handleAction('NULLIFY', 0)} className={`btn-action ${hasPendingActions ? 'btn-urgent pulse' : ''}`} disabled={!hasPendingActions || nullifyUsedThisTurn} style={hasPendingActions && !nullifyUsedThisTurn ? { backgroundColor: 'rgba(255, 0, 0, 0.2)', borderColor: '#ff0000', color: '#ff0000' } : { borderColor: '#555', color: '#555' }}>
                                        <X size={18} /> <span>NULLIFY</span><span className="ap-cost">{nullifyUsedThisTurn ? '済' : '0AP'}</span>
                                    </SkillButton>
                                </>
                            )}

                            {/* Role Specifics */}
                            {myRole === 'ネットワーク管理者' && (
                                <>
                                    <SkillButton tooltip="1AP: ロール調査。" onClick={() => { setIsTraceMode(!isTraceMode); setIsIpBlockMode(false); }} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={isTraceMode ? { backgroundColor: 'rgba(255, 255, 0, 0.2)', borderColor: '#ffff00', color: '#ffff00' } : { borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Search size={18} /> <span>ログ追跡</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 対象のアクション封鎖。" onClick={() => { setIsIpBlockMode(!isIpBlockMode); setIsTraceMode(false); }} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={isIpBlockMode ? { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}>
                                        <Lock size={18} /> <span>IPブロック</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'セキュリティ分析官' && (
                                <>
                                    <SkillButton tooltip="1AP: デバフ無効化。" onClick={() => setIsPatchMode(!isPatchMode)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={isPatchMode ? { backgroundColor: 'rgba(0, 255, 136, 0.2)', borderColor: '#00ff88', color: '#00ff88' } : { borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Shield size={18} /> <span>パッチ適用</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 攻撃1回ブロック。" onClick={() => handleAction('FIREWALL', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Shield size={18} /> <span>ファイアウォール</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'DBエンジニア' && (
                                <>
                                    <SkillButton tooltip="1AP: 次回漏洩軽減。" onClick={() => handleAction('MASKING', 1)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Database size={18} /> <span>マスキング</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 実行者特定トラップ。" onClick={() => handleAction('HONEY_POT', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Database size={18} /> <span>ハニーポット</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'システムオペレーター' && (
                                <>
                                    <SkillButton tooltip="1AP: AP譲渡。" onClick={() => setIsTransferMode(!isTransferMode)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={isTransferMode ? { backgroundColor: 'rgba(136, 136, 255, 0.2)', borderColor: '#8888ff', color: '#8888ff' } : { borderColor: '#8888ff', color: '#8888ff' }}>
                                        <RotateCcw size={18} /> <span>AP譲渡</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: HP0時自動復旧。" onClick={() => handleAction('RESTORE', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ff4444', color: '#ff4444' }}>
                                        <Zap size={18} /> <span>リストア設定</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'インフラリーダー' && (
                                <>
                                    <SkillButton tooltip="1AP: 他職スキル習得。" onClick={() => handleAction('SKILL_COPY', 1)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={{ borderColor: '#00ff88', color: '#00ff88' }}>
                                        <Cpu size={18} /> <span>レプリケーション</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: MaxHP拡張。" onClick={() => handleAction('SPEC_UP', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Zap size={18} /> <span>スペックアップ</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}
                            {myRole === 'DevOps' && (
                                <>
                                    <SkillButton tooltip="1AP: BOT効率UP同期。" onClick={() => setIsPipelineMode(!isPipelineMode)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 1} style={isPipelineMode ? { backgroundColor: 'rgba(0, 255, 255, 0.2)', borderColor: '#00ffff', color: '#00ffff' } : { borderColor: '#00ffff', color: '#00ffff' }}>
                                        <Cpu size={18} /> <span>CI/CDパイプライン</span><span className="ap-cost">1AP</span>
                                    </SkillButton>
                                    <SkillButton tooltip="2AP: 解析BOT配備。" onClick={() => handleAction('DEPLOY_BOT', 2)} className="btn-action btn-special" disabled={phase === 'resolve' || ap < 2} style={{ borderColor: '#ffff00', color: '#ffff00' }}>
                                        <Cpu size={18} /> <span>BOT配備</span><span className="ap-cost">2AP</span>
                                    </SkillButton>
                                </>
                            )}

                            {/* Copied Skill */}
                            {copiedSkill && (
                                <SkillButton tooltip={`1AP: ${copiedSkillLabel}`} onClick={() => { const target = ['TRACE_LOG', 'PATCH', 'TRANSFER', 'PIPELINE', 'IP_BLOCK'].includes(copiedSkill); if (target) setIsCopiedSkillMode(!isCopiedSkillMode); else handleAction(copiedSkill, 1); }} className="btn-action" disabled={phase === 'resolve' || ap < 1} style={isCopiedSkillMode ? { backgroundColor: 'rgba(188, 19, 254, 0.2)', borderColor: '#bc13fe', color: '#bc13fe' } : { borderColor: '#bc13fe', color: '#bc13fe' }}>
                                    <Cpu size={18} /> <span>★ {copiedSkillLabel}</span><span className="ap-cost">1AP</span>
                                </SkillButton>
                            )}

                            <SkillButton tooltip="ステータス更新" onClick={() => addLog(`STATUS: HP=${systemHp}% | LEAK=${dataLeak}% | AP=${ap}`, 'info')} className="btn-action btn-status">
                                <AlertTriangle size={18} /> <span>ステータス</span>
                            </SkillButton>
                        </div>
                    ) : (
                        <div className="action-grid hacker-grid">
                            <SkillButton tooltip="2AP: HP減少 or 漏洩増加。" onClick={() => handleAction('INJECT_MALWARE', 2)} className="btn-action btn-hacker-action" disabled={phase === 'resolve' || ap < 2}>
                                <Skull size={18} /> <span>マルウェア</span><span className="ap-cost">2AP</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: 漏洩増加。" onClick={() => handleAction('EXFILTRATE', 1)} className="btn-action btn-hacker-action" disabled={phase === 'resolve' || ap < 1}>
                                <Database size={18} /> <span>持ち出し</span><span className="ap-cost">1AP</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: 痕跡除去。" onClick={() => handleAction('COVER_TRACKS', 1)} className="btn-action btn-hacker-action" disabled={phase === 'resolve' || ap < 1}>
                                <Lock size={18} /> <span>痕跡消去</span><span className="ap-cost">1AP</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: 対象AP-2。" onClick={() => { setIsDdosMode(!isDdosMode); setIsFalseFlagMode(false); }} className="btn-action btn-hacker-action" disabled={phase === 'resolve' || ap < 1} style={isDdosMode ? { backgroundColor: 'rgba(255, 68, 68, 0.3)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}>
                                <Zap size={18} /> <span>DDOS</span><span className="ap-cost">1AP</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: POSITIVE偽装。" onClick={() => { setIsFalseFlagMode(!isFalseFlagMode); setIsDdosMode(false); }} className="btn-action btn-hacker-action" disabled={phase === 'resolve' || ap < 1} style={isFalseFlagMode ? { backgroundColor: 'rgba(255, 68, 68, 0.3)', borderColor: '#ff4444', color: '#ff4444' } : { borderColor: '#ff4444', color: '#ff4444' }}>
                                <AlertTriangle size={18} /> <span>工作</span><span className="ap-cost">1AP</span>
                            </SkillButton>
                            <SkillButton tooltip="1AP: ステータス(偽)。" onClick={() => addLog(`STATUS (FAKE): HP=正常 | LEAK=安全`, 'info')} className="btn-action btn-hacker-action">
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
            {showHackerMenu && (
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
            )}

            {phase === 'final_voting' && gameResult === 'playing' && (
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
                                <button onClick={handleFinalVoteSubmit} disabled={!finalMurdererVote || !finalHackerVote} className="bg-green-600 py-2 font-bold disabled:opacity-30">告発</button>
                            </div>
                        ) : (
                            <div className="p-4 text-center">
                                <p className="text-green-400">✓ 告発完了</p>
                                <p className="text-xs text-gray-500">待機中... ({finalVotedCount}/{players.length})</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {gameResult !== 'playing' && (
                <div className="modal-overlay game-over-overlay">
                    <div className="game-over-modal">
                        <h2 className="game-over-title">{gameResult}</h2>
                        <div className="game-over-stats px-8 py-4">
                            <div className="flex justify-between"><span>HP:</span><span>{systemHp}%</span></div>
                            <div className="flex justify-between"><span>LEAK:</span><span>{dataLeak}%</span></div>
                            <div className="flex justify-between"><span>TURN:</span><span>{turn}</span></div>
                        </div>
                        <button className="btn-restart" onClick={resetGame}><RotateCcw size={16} /> ミッション再開</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameScreen;
