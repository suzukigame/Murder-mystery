import { useState, useEffect, useCallback } from 'react';
import './App.css';
import io from 'socket.io-client';

// コンポーネント
import LoginScreen from './components/LoginScreen';
import RoomLobby from './components/RoomLobby';
import GameScreen from './components/GameScreen';
import SpectatorScreen from './components/SpectatorScreen';
import GameManual from './components/GameManual';

// 型定義
import { LogEntry, TurnPhase, GameResult, Room } from './types';

// ソケット接続
// VITE_SOCKET_URL が設定されている場合はそれを使用（Tauri等のデスクトップアプリ用）
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.MODE === 'production' ? '/' : 'http://localhost:3000');
const socket = io(SOCKET_URL);

function App() {
    // --- システム状態 ---
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isJoined, setIsJoined] = useState(false);
    const [isSpectator, setIsSpectator] = useState(false);
    const [myPlayerName, setMyPlayerName] = useState(sessionStorage.getItem('nexus_player_name') || '');
    const [rooms, setRooms] = useState<Room[]>([]);
    const [showManual, setShowManual] = useState(false);

    // --- ゲーム状態 (サーバー同期) ---
    const [ap, setAp] = useState(3);
    const [turn, setTurn] = useState<number>(1);
    const [timeLeft, setTimeLeft] = useState(60);
    const [turnDuration, setTurnDuration] = useState(60);
    const [phase, setPhase] = useState<TurnPhase>('discussion');
    const [systemHp, setSystemHp] = useState(100);
    const [maxHp, setMaxHp] = useState(100);
    const [dataLeak, setDataLeak] = useState(0);
    const [evidenceAnalysis, setEvidenceAnalysis] = useState(0);
    const [gameResult, setGameResult] = useState<GameResult>('playing');
    const [nextTurnDebuff, setNextTurnDebuff] = useState(0);
    const [chargedAp, setChargedAp] = useState(0);
    const [players, setPlayers] = useState<any[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [gmPlayerInfo, setGmPlayerInfo] = useState<any[]>([]);
    const [gmActorMap, setGmActorMap] = useState<{ [logId: string]: string }>({});
    const [hasPendingActions, setHasPendingActions] = useState(false);
    const [nullifyUsedThisTurn, setNullifyUsedThisTurn] = useState(false);
    const [revealedMurdererName, setRevealedMurdererName] = useState<string | null>(null);

    // --- UI固有状態 ---
    const [myRole, setMyRole] = useState('');
    const [mySecret, setMySecret] = useState('');
    const [isHacker, setIsHacker] = useState(false);
    const [isMurderer, setIsMurderer] = useState(false);
    const [isIsolated, setIsIsolated] = useState(false);
    const [isIpBlocked, setIsIpBlocked] = useState(false);
    const [showHackerMenu, setShowHackerMenu] = useState(false);
    const [isAlert, setIsAlert] = useState(false);
    const [finalMurdererVote, setFinalMurdererVote] = useState('');
    const [finalHackerVote, setFinalHackerVote] = useState('');
    const [hasSubmittedFinalVote, setHasSubmittedFinalVote] = useState(false);
    const [finalVotedCount, setFinalVotedCount] = useState(0);

    // モード類
    const [isTraceMode, setIsTraceMode] = useState(false);
    const [isDdosMode, setIsDdosMode] = useState(false);
    const [isFalseFlagMode, setIsFalseFlagMode] = useState(false);
    const [isLockoutMode, setIsLockoutMode] = useState(false);
    const [isPipelineMode, setIsPipelineMode] = useState(false);
    const [isTransferMode, setIsTransferMode] = useState(false);
    const [isPatchMode, setIsPatchMode] = useState(false);
    const [isIpBlockMode, setIsIpBlockMode] = useState(false);
    const [isCopiedSkillMode, setIsCopiedSkillMode] = useState(false);
    const [copiedSkill, setCopiedSkill] = useState<string | null>(null);
    const [copiedSkillLabel, setCopiedSkillLabel] = useState<string | null>(null);

    // --- 共通ユーティリティ ---
    const addLog = useCallback((content: string, level: LogEntry['level'] = 'info') => {
        setLogs(prev => [{
            id: 'local-' + Date.now() + Math.random(),
            time: new Date().toLocaleTimeString(),
            level,
            content
        }, ...prev].slice(0, 100));
    }, []);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const getPhaseLabel = () => {
        if (gameResult !== 'playing') return 'ミッション完了';
        switch (phase) {
            case 'discussion': return '議論中';
            case 'action': return 'アクション待機';
            case 'resolve': return '処理中';
            case 'final_voting': return '最終告発';
            default: return phase;
        }
    };

    // --- ターン更新時のAP処理(デバフ・チャージ適用) ---
    useEffect(() => {
        let baseAp = 3;
        const maxAp = baseAp + chargedAp;
        const limit = (isHacker || isMurderer) ? Math.max(6, 6 + chargedAp) : Math.max(3, 3 + chargedAp);
        setAp(Math.min(limit, Math.max(0, maxAp - nextTurnDebuff)));
        setNextTurnDebuff(0); // 適用したらリセット
    }, [turn, chargedAp, isHacker, isMurderer]);

    // --- Socket.io イベント ---
    useEffect(() => {
        socket.on('room_list', (roomList: Room[]) => setRooms(roomList));

        socket.on('join_success', (data: { roomId: string, name: string, token: string }) => {
            setIsJoined(true);
            setMyPlayerName(data.name);
            sessionStorage.setItem('nexus_player_name', data.name);
            sessionStorage.setItem('nexus_session_token', data.token);
            addLog(`ACCESS GRANTED: ROOM ${data.roomId} VERIFIED.`, 'system');
        });

        socket.on('private_message', (msg: { senderId: string, senderName: string, message: string }) => {
            const senderPrefix = msg.senderName ? `[${msg.senderName}] ` : '[SECRET] ';
            const newLog: LogEntry = {
                id: Math.random().toString(36).substring(2, 11),
                time: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
                content: `${senderPrefix}${msg.message}`,
                level: 'warn',
            };
            setLogs(prev => [newLog, ...prev].slice(0, 100));
        });

        socket.on('state_update', (newState) => {
            setTurn(newState.turn);
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
            setIsAlert(newState.isAlert || false);

            if (newState.isPaused && newState.finalVotingResult && newState.finalVotingResult !== 'none') {
                setGameResult(newState.finalVotingResult as GameResult);
            } else if (newState.hp <= 0) {
                setGameResult('hacker_win_hp');
            } else if (newState.leak >= 100) {
                setGameResult('hacker_win_leak');
            } else {
                setGameResult('playing');
            }

            if (newState.phase === 'final_voting') {
                setFinalVotedCount(Object.keys(newState.finalVotesMurderer || {}).length);
            }

            const me = newState.players.find((p: any) => p.id === socket.id);
            if (me) {
                setIsIsolated(me.isIsolated);
                setIsIpBlocked(me.isIpBlocked || false);
                setChargedAp(me.chargedAp || 0);
                if (me.role && me.role !== 'TBD') setMyRole(me.role);
                setNullifyUsedThisTurn(me.nullifyUsedThisTurn || false);
                if (me.copiedSkill) {
                    setCopiedSkill(me.copiedSkill);
                    setCopiedSkillLabel(me.copiedSkillLabel || me.copiedSkill);
                } else {
                    setCopiedSkill(null);
                    setCopiedSkillLabel(null);
                }
            }
        });

        socket.on('log_update', (newLog: LogEntry) => {
            setLogs(prev => [newLog, ...prev].slice(0, 100));
        });

        socket.on('log_history', (history: LogEntry[]) => {
            setLogs(history);
        });

        socket.on('role_assigned', (data: { isHacker: boolean, isMurderer: boolean, roleName: string, secret: string }) => {
            setIsHacker(data.isHacker);
            setIsMurderer(data.isMurderer);
            setMySecret(data.secret);
            setMyRole(data.roleName);
            addLog(`RESTRICTED DATA RECEIVED: Role verified. Intel decrypted.`, 'system');
        });

        socket.on('ap_debuff', (data: { amount: number, chargedAp: number }) => {
            setNextTurnDebuff(data.amount);
            setChargedAp(data.chargedAp || 0);
            if (data.amount > 0) {
                addLog(`SYSTEM ALERT: RESOURCE THROTTLE SCHEDULED.`, 'critical');
            }
        });

        socket.on('spectator_confirmed', () => {
            setIsSpectator(true);
            setIsJoined(true);
        });
        socket.on('gm_info', (info: any[]) => setGmPlayerInfo(info));
        socket.on('gm_log_update', (gmLog: any) => {
            if (gmLog.actor && gmLog.id) {
                setGmActorMap(prev => ({ ...prev, [gmLog.id]: gmLog.actor }));
            }
        });

        socket.on('error', (msg: string) => {
            addLog(`SECURITY ALERT: ${msg}`, 'critical');
            if (msg.includes('認証エラー')) {
                sessionStorage.removeItem('nexus_player_name');
                sessionStorage.removeItem('nexus_session_token');
                setIsJoined(false);
                setIsLoggedIn(false);
            }
        });

        return () => {
            socket.off('room_list');
            socket.off('join_success');
            socket.off('private_message');
            socket.off('state_update');
            socket.off('log_update');
            socket.off('log_history');
            socket.off('role_assigned');
            socket.off('ap_debuff');
            socket.off('spectator_confirmed');
            socket.off('gm_info');
            socket.off('gm_log_update');
            socket.off('error');
        };
    }, []);

    // --- ハンドラー ---
    const handleLogin = (name: string) => {
        setMyPlayerName(name);
        setIsLoggedIn(true);
        socket.emit('list_rooms');
    };

    const handleJoin = (roomId: string) => {
        setIsJoined(true);
        addLog(`ROOM JOINED: ${roomId}`, 'system');
        // ルーム参加後、自動的にゲームにプレイヤーとして登録
        const token = sessionStorage.getItem('nexus_session_token') || undefined;
        socket.emit('join_game', { name: myPlayerName, role: '', token });
    };

    const handleAction = (name: string, cost: number, targetId?: string) => {
        if (gameResult !== 'playing' || isIpBlocked) return;
        if (ap >= cost) {
            setAp(prev => prev - cost);
            socket.emit('action', { type: name, cost, targetId });
            addLog(`COMMAND SENT: ${name}`, 'system');
        } else {
            addLog(`ERROR: INSUFFICIENT ACTION POINTS.`, 'warn');
        }
    };

    const handleHackerAction = (name: string, cost: number) => {
        if (gameResult !== 'playing' || isIpBlocked) return;
        if (ap >= cost) {
            setAp(prev => prev - cost);
            socket.emit('action', { type: name, cost });
        }
        setShowHackerMenu(false);
    };

    const handleVote = (targetId: string) => socket.emit('vote', { targetId });
    const handleCancelVote = () => socket.emit('cancel_vote');

    const handleFinalVoteSubmit = () => {
        if (!finalMurdererVote || !finalHackerVote) return;
        socket.emit('final_vote', { murdererVote: finalMurdererVote, hackerVote: finalHackerVote });
        setHasSubmittedFinalVote(true);
    };

    const resetGame = () => {
        setAp(3);
        setGameResult('playing');
        setHasSubmittedFinalVote(false);
        socket.emit('reset_game');
    };

    const forceStart = () => socket.emit('start_game_force');

    const handleLeave = () => {
        socket.emit('leave_room');
        setIsJoined(false);
        setIsSpectator(false);
        setGameResult('playing');
    };

    // --- レンダリング ---
    if (!isLoggedIn) {
        return <LoginScreen onLogin={handleLogin} defaultName={myPlayerName} />;
    }

    if (!isJoined) {
        return (
            <RoomLobby
                socket={socket}
                onJoin={handleJoin}
                rooms={rooms}
                playerName={myPlayerName}
                onLogout={() => setIsLoggedIn(false)}
            />
        );
    }

    if (isSpectator) {
        return (
            <SpectatorScreen
                socket={socket}
                maxHp={maxHp}
                systemHp={systemHp}
                dataLeak={dataLeak}
                evidenceAnalysis={evidenceAnalysis}
                turn={turn}
                timeLeft={timeLeft}
                turnDuration={turnDuration}
                phaseLabel={getPhaseLabel()}
                gmPlayerInfo={gmPlayerInfo}
                players={players}
                logs={logs}
                gmActorMap={gmActorMap}
                formatTime={formatTime}
            />
        );
    }

    return (
        <>
            <GameScreen
                // Props passing...
                socket={socket}
                myPlayerName={myPlayerName}
                myRole={myRole}
                mySecret={mySecret}
                ap={ap}
                turn={turn}
                timeLeft={timeLeft}
                turnDuration={turnDuration}
                phase={phase}
                systemHp={systemHp}
                maxHp={maxHp}
                dataLeak={dataLeak}
                evidenceAnalysis={evidenceAnalysis}
                gameResult={gameResult}
                isHacker={isHacker}
                isMurderer={isMurderer}
                isIsolated={isIsolated}
                isIpBlocked={isIpBlocked}
                players={players}
                logs={logs}
                hasPendingActions={hasPendingActions}
                nullifyUsedThisTurn={nullifyUsedThisTurn}
                showHackerMenu={showHackerMenu}
                setShowHackerMenu={setShowHackerMenu}
                showManual={showManual}
                setShowManual={setShowManual}
                isAlert={isAlert}
                finalMurdererVote={finalMurdererVote}
                setFinalMurdererVote={setFinalMurdererVote}
                finalHackerVote={finalHackerVote}
                setFinalHackerVote={setFinalHackerVote}
                hasSubmittedFinalVote={hasSubmittedFinalVote}
                finalVotedCount={finalVotedCount}
                revealedMurdererName={revealedMurdererName}
                isTraceMode={isTraceMode}
                setIsTraceMode={setIsTraceMode}
                isDdosMode={isDdosMode}
                setIsDdosMode={setIsDdosMode}
                isFalseFlagMode={isFalseFlagMode}
                setIsFalseFlagMode={setIsFalseFlagMode}
                isLockoutMode={isLockoutMode}
                setIsLockoutMode={setIsLockoutMode}
                isPipelineMode={isPipelineMode}
                setIsPipelineMode={setIsPipelineMode}
                isTransferMode={isTransferMode}
                setIsTransferMode={setIsTransferMode}
                isPatchMode={isPatchMode}
                setIsPatchMode={setIsPatchMode}
                isIpBlockMode={isIpBlockMode}
                setIsIpBlockMode={setIsIpBlockMode}
                isCopiedSkillMode={isCopiedSkillMode}
                setIsCopiedSkillMode={setIsCopiedSkillMode}
                copiedSkill={copiedSkill}
                copiedSkillLabel={copiedSkillLabel}
                handleAction={handleAction}
                handleHackerAction={handleHackerAction}
                handleVote={handleVote}
                handleCancelVote={handleCancelVote}
                handleFinalVoteSubmit={handleFinalVoteSubmit}
                resetGame={resetGame}
                forceStart={forceStart}
                handleLeave={handleLeave}
                addLog={addLog}
                formatTime={formatTime}
                getPhaseLabel={getPhaseLabel}
            />
            {showManual && <GameManual onClose={() => setShowManual(false)} />}
        </>
    );
}

export default App;
