import { GameState, PendingAction } from './types';
import { getInitialState } from './gameLogic';

export interface Room {
    id: string;
    name: string;
    gameState: GameState;
    pendingActions: PendingAction[];
    spectatorIds: Set<string>;
    timerId: ReturnType<typeof setInterval> | null;
}

export class RoomManager {
    private rooms: Map<string, Room> = new Map();

    constructor() { }

    /**
     * 新しいルームを作成する
     */
    createRoom(roomId: string, name: string): Room {
        const gameState = getInitialState();
        const room: Room = {
            id: roomId,
            name,
            gameState,
            pendingActions: [],
            spectatorIds: new Set(),
            timerId: null,
        };
        this.rooms.set(roomId, room);
        return room;
    }

    /**
     * ルームを取得する
     */
    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    /**
     * ルームを削除する
     */
    deleteRoom(roomId: string): boolean {
        const room = this.rooms.get(roomId);
        if (room && room.timerId) {
            clearInterval(room.timerId);
        }
        return this.rooms.delete(roomId);
    }

    /**
     * 全ルームを取得する
     */
    getAllRooms(): { id: string; name: string; playerCount: number }[] {
        return Array.from(this.rooms.values()).map(room => ({
            id: room.id,
            name: room.name,
            playerCount: room.gameState.players.length,
        }));
    }

    /**
     * ルームIDの重複チェックなどのバリデーション
     */
    isIdAvailable(roomId: string): boolean {
        return !this.rooms.has(roomId);
    }
}

export const roomManager = new RoomManager();
