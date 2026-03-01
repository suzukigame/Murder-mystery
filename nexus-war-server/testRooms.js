const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

async function testRoomSystem() {
    console.log('--- Starting Room System Test ---');

    const socket1 = io(SERVER_URL);
    const socket2 = io(SERVER_URL);

    // Promise wrappers for events
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    socket1.on('connect', () => console.log('Socket 1 connected'));
    socket2.on('connect', () => console.log('Socket 2 connected'));

    await wait(1000);

    // Room List
    socket1.on('room_list', (rooms) => console.log('Room List:', rooms));
    socket1.emit('list_rooms');
    await wait(500);

    // Create Room 1
    console.log('Creating Room A...');
    socket1.emit('create_room', { roomId: 'room-a', name: 'Room Alpha' });
    await wait(500);

    // Create Room 2
    console.log('Creating Room B...');
    socket2.emit('create_room', { roomId: 'room-b', name: 'Room Beta' });
    await wait(500);

    // Join Room A
    console.log('Joining Room A from Socket 1...');
    socket1.emit('join_room', 'room-a');
    await wait(500);

    // Join Game in Room A
    socket1.emit('join_game', { name: 'Player-A1', role: 'TBD' });
    await wait(500);

    // Check if Room B is empty
    console.log('Room list after creations:');
    socket1.emit('list_rooms');
    await wait(500);

    // Cleanup
    socket1.disconnect();
    socket2.disconnect();
    console.log('--- Test Completed ---');
}

testRoomSystem().catch(console.error);
