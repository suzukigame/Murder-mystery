const { io } = require('socket.io-client');

const players = ['一文字', '二瓶', '三和', '四宮', '五香', '六角'];
const roles = ['ネットワーク管理者', 'セキュリティ分析官', 'DBエンジニア', 'システムオペレーター', 'インフラリーダー', 'DevOps'];
const sockets = [];

async function startTest() {
    console.log('--- Starting Skill Verification Test ---');

    // 1. 全員接続
    for (let i = 0; i < 6; i++) {
        const socket = io('http://localhost:3000');
        sockets.push({ socket, name: players[i], role: '', id: '' });

        socket.on('connect', () => {
            // console.log(`${players[i]} connected`);
            socket.emit('join_game', { name: players[i] });
        });

        socket.on('role_assigned', (data) => {
            sockets[i].role = data.roleName;
            sockets[i].isHacker = data.isHacker;
            sockets[i].isMurderer = data.isMurderer;
            console.log(`[Role] ${players[i]}: ${data.roleName} (Hacker:${data.isHacker}, Murderer:${data.isMurderer})`);
        });

        socket.on('ap_debuff', (data) => {
            // console.log(`[AP] ${players[i]} Debuff: ${data.amount}`);
        });

        // ログ監視
        socket.on('log_update', (log) => {
            console.log(`[Log] ${log.content}`);
        });
    }

    // 接続待ち
    await new Promise(r => setTimeout(r, 2000));
    console.log('--- Game Started Check ---');

    // 2. インフラリーダーを探してスキルコピー実行
    const infra = sockets.find(s => s.role === 'インフラリーダー');
    if (infra) {
        console.log(`Testing Infra Skill: SKILL_COPY by ${infra.name}`);
        infra.socket.emit('action', { type: 'SKILL_COPY', cost: 1 });
    }

    await new Promise(r => setTimeout(r, 1000));

    // 3. インフラリーダーがスペックアップ実行
    if (infra) {
        console.log(`Testing Infra Skill: SPEC_UP by ${infra.name}`);
        infra.socket.emit('action', { type: 'SPEC_UP', cost: 2 });
    }

    await new Promise(r => setTimeout(r, 1000));

    // 4. SysOpを探してリストア実行
    const sysop = sockets.find(s => s.role === 'システムオペレーター');
    if (sysop) {
        console.log(`Testing SysOp Skill: RESTORE by ${sysop.name}`);
        sysop.socket.emit('action', { type: 'RESTORE', cost: 2 });
    }

    // 5. ハッカーがマルウェアを連打 (制限チェック)
    const hacker = sockets.find(s => s.isHacker);
    if (hacker) {
        console.log(`Testing Hacker Limit: INJECT_MALWARE x3 by ${hacker.name}`);
        hacker.socket.emit('action', { type: 'INJECT_MALWARE', cost: 2 });
        await new Promise(r => setTimeout(r, 500));
        hacker.socket.emit('action', { type: 'INJECT_MALWARE', cost: 2 });
        await new Promise(r => setTimeout(r, 500));
        hacker.socket.emit('action', { type: 'INJECT_MALWARE', cost: 2 });
    }

    await new Promise(r => setTimeout(r, 3000));
    console.log('Test logic completed. Check logs manually.');
    // process.exit(0);
}

startTest();
