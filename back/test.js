import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rooms } from './controllers/keyExchange.js';
import chatCtrl from './controllers/chat.js';
import keyExchangeCtrl from './controllers/keyExchange.js';

// fake Express req/res without starting the server
function fakeReqRes(body) {
    let req = { body: body || {} };
    let statusSent = 200;
    let jsonSent = null;
    let res = {
        status(code) { statusSent = code; return res; },
        json(data) { jsonSent = data; return res; },
    };
    return { req, res, getStatus() { return statusSent; }, getBody() { return jsonSent; } };
}

describe('room name format', () => {
    it('is 5 lowercase alphanumeric chars', () => {
        let chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 50; i++) {
            let name = '';
            for (let j = 0; j < 5; j++) {
                name += chars[Math.floor(Math.random() * chars.length)];
            }
            assert.equal(name.length, 5);
            assert.match(name, /^[a-z0-9]{5}$/);
        }
    });
});

describe('hostRegistersRoom', () => {
    it('creates a room and returns hostToken + roomName', async () => {
        rooms.clear();
        let fake = fakeReqRes();
        await keyExchangeCtrl.hostRegistersRoom(fake.req, fake.res);
        let body = fake.getBody();
        assert.ok(body.hostToken);
        assert.equal(body.roomName.length, 5);
        assert.ok(rooms.has(body.roomName));
    });
});

describe('joinerFindsRoom', () => {
    it('returns joinerToken if room exists', async () => {
        rooms.clear();
        let reg = fakeReqRes();
        await keyExchangeCtrl.hostRegistersRoom(reg.req, reg.res);
        let roomName = reg.getBody().roomName;
        let find = fakeReqRes({ roomName });
        await keyExchangeCtrl.joinerFindsRoom(find.req, find.res);
        assert.equal(find.getStatus(), 200);
        assert.ok(find.getBody().joinerToken);
    });

    it('returns 404 if room does not exist', async () => {
        rooms.clear();
        let find = fakeReqRes({ roomName: 'xxxxx' });
        await keyExchangeCtrl.joinerFindsRoom(find.req, find.res);
        assert.equal(find.getStatus(), 404);
    });

    it('destroys room if a second joiner tries to enter', async () => {
        rooms.clear();
        let reg = fakeReqRes();
        await keyExchangeCtrl.hostRegistersRoom(reg.req, reg.res);
        let roomName = reg.getBody().roomName;
        let find1 = fakeReqRes({ roomName });
        await keyExchangeCtrl.joinerFindsRoom(find1.req, find1.res);
        assert.equal(find1.getStatus(), 200);
        let find2 = fakeReqRes({ roomName });
        await keyExchangeCtrl.joinerFindsRoom(find2.req, find2.res);
        assert.equal(find2.getStatus(), 404);
        assert.ok(!rooms.has(roomName));
    });
});

describe('message flow', () => {
    // creates a room with host + joiner, ready for chat
    async function setupRoom() {
        rooms.clear();
        let reg = fakeReqRes();
        await keyExchangeCtrl.hostRegistersRoom(reg.req, reg.res);
        let roomName = reg.getBody().roomName;
        let hostToken = reg.getBody().hostToken;
        let find = fakeReqRes({ roomName });
        await keyExchangeCtrl.joinerFindsRoom(find.req, find.res);
        let joinerToken = find.getBody().joinerToken;
        rooms.get(roomName).ongoingChat = true;
        return { roomName, hostToken, joinerToken };
    }

    it('host sends a message, joiner retrieves it', async () => {
        let data = await setupRoom();
        let send = fakeReqRes({ hostToken: data.hostToken, roomName: data.roomName, message: 'encrypted_msg_1' });
        await chatCtrl.hostSendsMessage(send.req, send.res);
        assert.equal(send.getStatus(), 200);
        let get = fakeReqRes({ joinerToken: data.joinerToken, roomName: data.roomName });
        await chatCtrl.joinerAsksForMessage(get.req, get.res);
        assert.equal(get.getStatus(), 200);
        let msgs = get.getBody();
        assert.equal(msgs.length, 1);
        assert.equal(msgs[0].message, 'encrypted_msg_1');
        assert.equal(msgs[0].sender, 'host');
    });

    it('rejects message if token is wrong', async () => {
        let data = await setupRoom();
        let send = fakeReqRes({ hostToken: 'wrong-token', roomName: data.roomName, message: 'msg' });
        await chatCtrl.hostSendsMessage(send.req, send.res);
        assert.equal(send.getStatus(), 403);
    });

    it('deleteRoom removes the room', async () => {
        let data = await setupRoom();
        let del = fakeReqRes({ token: data.hostToken, roomName: data.roomName });
        await chatCtrl.deleteRoom(del.req, del.res);
        assert.equal(del.getStatus(), 200);
        assert.ok(!rooms.has(data.roomName));
    });
});
