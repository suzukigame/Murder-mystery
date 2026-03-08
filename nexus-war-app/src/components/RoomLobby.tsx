import React, { useState, useEffect } from 'react';
import { Plus, Users, Zap } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Room } from '../types';

interface RoomLobbyProps {
    socket: Socket;
    onJoin: (roomId: string) => void;
    rooms: Room[];
    playerName: string;
    onLogout: () => void;
}

const RoomLobby: React.FC<RoomLobbyProps> = ({ socket, onJoin, rooms }) => {
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomId, setNewRoomId] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // App.tsx側で一括管理するため、ルーム一覧のローカル取得は不要
        // ただし初期化時にlist_roomsを送る役割は残す
        socket.emit('list_rooms');

        socket.on('create_room_success', (data: { roomId: string }) => {
            // 作成成功したら自動で参加
            socket.emit('join_room', data.roomId);
        });

        socket.on('join_room_success', (data: { roomId: string; roomName: string }) => {
            onJoin(data.roomId);
        });

        socket.on('error', (msg: string) => {
            setError(msg);
            setTimeout(() => setError(null), 5000);
        });

        // 初期取得
        socket.emit('list_rooms');

        return () => {
            socket.off('create_room_success');
            socket.off('join_room_success');
            socket.off('error');
        };
    }, [socket, onJoin]);

    const handleCreateRoom = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRoomId.trim() || !newRoomName.trim()) return;
        socket.emit('create_room', { roomId: newRoomId, name: newRoomName });
    };

    const handleJoinRoom = (roomId: string) => {
        socket.emit('join_room', roomId);
    };

    return (
        <div className="terminal-screen flex flex-col items-center justify-center min-h-screen w-screen p-4 bg-black text-green-500 font-mono overflow-auto">
            <style>{`
        .glitch-text { position: relative; }
        .glitch-text::before, .glitch-text::after { content: attr(data-text); position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .glitch-text::before { left: 2px; text-shadow: -1px 0 red; clip: rect(24px, 550px, 90px, 0); animation: glitch-anim-2 3s infinite linear alternate-reverse; }
        .glitch-text::after { left: -2px; text-shadow: -1px 0 blue; clip: rect(85px, 550px, 140px, 0); animation: glitch-anim 2.5s infinite linear alternate-reverse; }
        @keyframes glitch-anim { 0% { clip: rect(10px, 9999px, 30px, 0); } 100% { clip: rect(80px, 9999px, 100px, 0); } }
        @keyframes glitch-anim-2 { 0% { clip: rect(60px, 9999px, 80px, 0); } 100% { clip: rect(10px, 9999px, 100px, 0); } }
      `}</style>

            <div className="mb-12 text-center z-10 w-full max-w-4xl">
                <h1 className="text-5xl md:text-6xl font-bold mb-2 glitch-text tracking-tighter text-shadow-green" data-text="SKY-MAGYCC JUDAS">SKY-MAGYCC JUDAS</h1>
                <p className="text-green-700 tracking-widest text-sm">THE JUDAS PROTOCOL :: ROOM SELECTION</p>
            </div>

            <div className="border border-green-500/50 p-6 md:p-8 rounded bg-black/90 max-w-4xl w-full shadow-[0_0_20px_rgba(0,255,0,0.2)] relative backdrop-blur-sm z-10">
                <div className="flex justify-between items-center mb-6 border-b border-green-500/30 pb-4">
                    <h2 className="text-xl flex items-center gap-2 text-green-400">
                        <Users size={20} /> アクティブ・ルーム
                    </h2>
                    <button
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        className={`flex items-center gap-2 px-4 py-2 border transition-all text-sm font-bold ${showCreateForm ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-green-500/20 border-green-500 text-green-400'}`}
                    >
                        {showCreateForm ? 'キャンセル' : <><Plus size={16} /> ルーム作成</>}
                    </button>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500 text-red-500 p-3 mb-6 text-sm flex items-center gap-2 animate-pulse">
                        <Zap size={16} /> {error}
                    </div>
                )}

                {showCreateForm && (
                    <form onSubmit={handleCreateRoom} className="mb-8 p-6 border border-green-500/30 bg-green-500/5 rounded">
                        <h3 className="text-sm text-green-400 mb-4 tracking-widest border-l-2 border-green-500 pl-2">NEW ROOM PROTOCOL</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-[10px] text-green-700 mb-1 uppercase">Room ID (Unique)</label>
                                <input
                                    type="text"
                                    value={newRoomId}
                                    onChange={(e) => setNewRoomId(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
                                    placeholder="room-id..."
                                    className="w-full bg-black border border-green-500/30 p-3 text-green-500 text-sm focus:outline-none focus:border-green-400"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-green-700 mb-1 uppercase">Display Name</label>
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    placeholder="Room Name..."
                                    className="w-full bg-black border border-green-500/30 p-3 text-green-500 text-sm focus:outline-none focus:border-green-400"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-green-500 text-black py-3 font-bold hover:bg-green-400 transition-colors tracking-widest"
                        >
                            INITIALIZE ROOM
                        </button>
                    </form>
                )}

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {rooms.length === 0 ? (
                        <div className="text-center py-12 text-green-900 border border-dashed border-green-900/50 rounded flex flex-col items-center gap-4">
                            <span>NO ACTIVE ROOMS DETECTED. CREATE ONE TO START.</span>
                            <button
                                onClick={() => socket.emit('list_rooms')}
                                className="px-4 py-2 border border-green-700 text-green-500 hover:bg-green-500/10 transition-colors text-xs"
                            >
                                UPDATE LIST
                            </button>
                        </div>
                    ) : (
                        rooms.map((room) => (
                            <div
                                key={room.id}
                                className="group flex flex-col md:flex-row justify-between items-center p-4 border border-green-500/20 hover:border-green-500/60 hover:bg-green-500/5 transition-all cursor-pointer"
                                onClick={() => handleJoinRoom(room.id)}
                            >
                                <div className="flex items-center gap-4 w-full md:w-auto mb-3 md:mb-0">
                                    <div className="w-10 h-10 flex items-center justify-center bg-green-500/10 border border-green-500/30 text-green-500 group-hover:bg-green-500 group-hover:text-black transition-all">
                                        <Users size={20} />
                                    </div>
                                    <div>
                                        <div className="text-green-400 font-bold tracking-tight">{room.name}</div>
                                        <div className="text-[10px] text-green-800 font-mono">ID: {room.id}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
                                    <div className="flex flex-col items-end">
                                        <div className="text-xs text-green-600">CONNECTED NODES</div>
                                        <div className="text-lg font-bold text-green-400">{room.playerCount} / 6</div>
                                    </div>
                                    <button className="bg-green-900/40 border border-green-700 text-green-500 px-6 py-2 group-hover:bg-green-500 group-hover:text-black transition-all text-xs font-bold tracking-widest">
                                        DECRYPT & JOIN
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-8 flex justify-between items-center text-[10px] text-green-900 border-t border-green-900/50 pt-4 tracking-widest">
                    <span>SECURE CONNECTION :: UNAUTHORIZED ACCESS PROHIBITED :: SYSTEM LOG: {new Date().toISOString()}</span>
                    {rooms.length > 0 && (
                        <button
                            onClick={() => socket.emit('list_rooms')}
                            className="hover:text-green-500 transition-colors flex items-center gap-1"
                        >
                            <Zap size={10} /> REFRESH
                        </button>
                    )}
                </div>
            </div>

            <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{
                backgroundImage: 'linear-gradient(green 1px, transparent 1px), linear-gradient(90deg, green 1px, transparent 1px)',
                backgroundSize: '40px 40px'
            }}></div>
        </div>
    );
};

export default RoomLobby;
