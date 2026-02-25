import React, { useState } from 'react';
import { User, Zap } from 'lucide-react';

interface LoginScreenProps {
    onLogin: (name: string) => void;
    defaultName: string;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, defaultName }) => {
    const [name, setName] = useState(defaultName);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onLogin(name.trim());
        }
    };

    return (
        <div className="terminal-screen flex flex-col items-center justify-center min-h-screen w-screen p-4 bg-black text-green-500 font-mono">
            <div className="mb-12 text-center">
                <h1 className="text-5xl font-bold mb-2 tracking-tighter text-shadow-green uppercase">SKY-MAGYCC JUDAS</h1>
                <p className="text-green-700 tracking-widest text-sm">THE JUDAS PROTOCOL :: MAINFRAME ACCESS</p>
            </div>

            <div className="border border-green-500/50 p-8 rounded bg-black max-w-sm w-full shadow-[0_0_20px_rgba(0,255,0,0.2)]">
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <div>
                        <label className="block text-xs text-green-700 mb-2 tracking-widest uppercase">Identity Verification</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-green-900" size={18} />
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value.slice(0, 12))}
                                placeholder="USERNAME..."
                                className="w-full bg-black border border-green-500/30 p-3 pl-10 text-green-500 focus:outline-none focus:border-green-400 transition-all font-mono"
                                required
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-green-900">MAX 12 CHARS</span>
                            <span className="text-[10px] text-green-900">{name.length}/12</span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={!name.trim()}
                        className="w-full bg-green-500/10 border border-green-500 text-green-400 py-3 font-bold hover:bg-green-500 hover:text-black transition-all tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        ENTER SYSTEM
                    </button>
                </form>
            </div>

            <div className="mt-8 text-[10px] text-green-900 tracking-widest animate-pulse">
                <Zap size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                SECURE CONNECTION ESTABLISHED
            </div>
        </div>
    );
};

export default LoginScreen;
