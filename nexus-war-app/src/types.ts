export type TurnPhase = 'discussion' | 'action' | 'resolve' | 'final_voting';

export type GameResult =
    | 'playing'
    | 'hacker_win_hp'
    | 'hacker_win_leak'
    | 'defense_win'
    | 'murderer_found'
    | 'employee_perfect_win'
    | 'employee_win'
    | 'murderer_escape';

export interface LogEntry {
    id: string;
    time: string;
    level: 'info' | 'warn' | 'critical' | 'system';
    content: string;
}

export interface Player {
    id: string;
    name: string;
    role: string;
    isIsolated: boolean;
    votes: number;
    isHacker?: boolean;
    isMurderer?: boolean;
}

export interface Room {
    id: string;
    name: string;
    playerCount: number;
}
