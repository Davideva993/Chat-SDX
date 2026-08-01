import { rooms } from './keyExchange.js';
const timers = {};
const autoDeleteTimer = 6 * 60 * 60 * 1000  //6h
// Controller for chat routes

function inactivityTimerManager(roomName) {
  if (timers[roomName]) clearTimeout(timers[roomName]);
  timers[roomName] = setTimeout(async () => {
    rooms.delete(roomName);
    delete timers[roomName];
    // console.log("Room deleted:", roomName);
  }, autoDeleteTimer);
}
const chatCtrl = {

  hostSendsMessage: async (req, res) => {
    const { hostToken, roomName, message } = req.body;
    if (!hostToken || !roomName || !message) {
      return res.status(400).json({ error: 'Missing hostToken, roomName, or message' });
    }
    try {
      const result = await (async () => {
        const room = rooms.get(roomName);
        if (room && room.hostToken === hostToken) {
          if (room.messages.filter(m => m.sender === 'joiner').length) {
            return { status: 429, error: 'There is at least one new message for you: retrieve it first' };
          }
        } else {
          const targetRoom = rooms.get(roomName);
          if (targetRoom && targetRoom.hostToken !== hostToken) {
            const failedAttempts = targetRoom.failedAuth || 0;
            if (failedAttempts >= 3) {
              rooms.delete(roomName);
              return { status: 403, error: 'The room was destroyed because 3 failed attempts were detected' };
            }
            targetRoom.failedAuth = failedAttempts + 1;
          }
          return { status: 403, error: 'Invalid room or hostToken' };
        }
        const myPending = room.messages.filter(m => m.sender === 'host').length;
        if (myPending >= 3) {
          return { status: 429, error: 'Your partner has 3 pending messages: wait please' };
        }
        room.messages.push({ roomName, sender: 'host', message, order: myPending });
        inactivityTimerManager(roomName);
        return { success: true };
      })();
      if (result?.error) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Error in hostSendsMessage:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  joinerSendsMessage: async (req, res) => {
    const { joinerToken, roomName, message } = req.body;
    if (!joinerToken || !roomName || !message) {
      return res.status(400).json({ error: 'Missing joinerToken, roomName, or message' });
    }
    try {
           const result = await (async () => {
          const room = rooms.get(roomName);
          if (room && room.joinerToken === joinerToken) {
            if (room.messages.filter(m => m.sender === 'host').length) {
              return { status: 429, error: 'There is at least one new message for you: retrieve it first' };
            }
          } else {
            const targetRoom = rooms.get(roomName);
            if (targetRoom && targetRoom.joinerToken !== joinerToken) {
              const failedAttempts = targetRoom.failedAuth || 0;
              if (failedAttempts >= 3) {
                rooms.delete(roomName);
                return { status: 403, error: 'The room was destroyed because 3 failed attempts were detected' };
              }
              targetRoom.failedAuth = failedAttempts + 1;
            }
            return { status: 403, error: 'Invalid room or joinerToken' };
          }
          const myPending = room.messages.filter(m => m.sender === 'joiner').length;
          if (myPending >= 3) {
            return { status: 429, error: 'Your partner has 3 pending messages: wait please' };
          }
          room.messages.push({ roomName, sender: 'joiner', message, order: myPending });
          inactivityTimerManager(roomName);
          return { success: true };
        })()
      if (result?.error) {
        return res.status(result.status).json({ error: result.error });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Error in joinerSendsMessage:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },



  hostAsksForMessage: async (req, res) => {
    const { hostToken, roomName } = req.body;
    if (!hostToken || !roomName)
      return res.status(400).json({ error: 'Missing hostToken or roomName' });
    const room = rooms.get(roomName);
    if (!room || room.hostToken !== hostToken) {
      if (room && room.hostToken !== hostToken) {
        const failedAuthAttemps = room.failedAuth
        if (failedAuthAttemps >= 3) {
          rooms.delete(roomName);
          return res.status(403).json({ error: 'The room was destroyed because 3 failed attemps were detected' })
        }
        room.failedAuth = failedAuthAttemps + 1;
      }
      return res.status(403).json({ error: 'Invalid room or hostToken' })
    }
    const encryptedMessages = room.messages
      .filter(m => m.sender === "joiner")
      .sort((a, b) => a.order - b.order);
    if (encryptedMessages.length == 0) {
      return res.status(404).json({ warn: 'New messages not found' });
    }
    room.messages = room.messages.filter(m => m.sender !== "joiner")
    return res.status(200).json(encryptedMessages);
  },
joinerAsksForMessage: async (req, res) => {
    const { joinerToken, roomName } = req.body;
    if (!joinerToken || !roomName)
      return res.status(400).json({ error: 'Missing joinerToken or roomName' });
    const room = rooms.get(roomName);
    if (!room || room.joinerToken !== joinerToken) {
      if (room && room.joinerToken !== joinerToken) {
        const failedAuthAttemps = room.failedAuth
        if (failedAuthAttemps >= 3) {
          rooms.delete(roomName);
          return res.status(403).json({ error: 'The room was destroyed because 3 failed attemps were detected' })
        }
        room.failedAuth = failedAuthAttemps + 1;
      }
      return res.status(403).json({ error: 'Invalid room or joinerToken' })
    }
    const encryptedMessages = room.messages
      .filter(m => m.sender === "host")
      .sort((a, b) => a.order - b.order);
    if (encryptedMessages.length == 0) {
      return res.status(404).json({ warn: 'New messages not found' });
    }
    room.messages = room.messages.filter(m => m.sender !== "host")
    return res.status(200).json(encryptedMessages);
  },




  deleteRoom: async (req, res) => {
    const { token, roomName } = req.body;
    if (!token || !roomName)
      return res.status(400).json({ error: 'Missing token or roomName' });
    const room = rooms.get(roomName);
    if (!room || (room.hostToken !== token && room.joinerToken !== token))
      return res.status(403).json({ error: 'Invalid room or token' });
    if (timers[roomName]) {
      clearTimeout(timers[roomName]);
      delete timers[roomName];
    }
    rooms.delete(roomName);
    res.status(200).json({ success: true });
  },
}

export default chatCtrl;