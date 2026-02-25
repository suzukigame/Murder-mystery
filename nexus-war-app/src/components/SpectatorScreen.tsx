import React from 'react';
import { Eye, Cpu, Database, Search, Terminal } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { LogEntry } from '../types';

interface SpectatorScreenProps {
    socket: Socket;
    maxHp: number;
    systemHp: number;
    dataLeak: number;
    evidenceAnalysis: number;
    turn: number;
    timeLeft: number;
    turnDuration: number;
    phaseLabel: string;
    gmPlayerInfo: any[];
    players: any[];
    logs: LogEntry[];
    gmActorMap: { [logId: string]: string };
    formatTime: (seconds: number) => string;
}

const SpectatorScreen: React.FC<SpectatorScreenProps> = ({
    socket,
    maxHp,
    systemHp,
    dataLeak,
    evidenceAnalysis,
    turn,
    timeLeft,
    turnDuration,
    phaseLabel,
    gmPlayerInfo,
    players,
    logs,
    gmActorMap,
    formatTime,
}) => {
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
                    <span>{phaseLabel}</span>
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
                    <span>{phaseLabel}</span>
                </div>
            </footer>
        </div>
    );
};

export default SpectatorScreen;
