import { Room, Message } from '../models/db.js';
import { Op } from 'sequelize';
const timers = {};
const autoDeleteTimer = 6 * 60 * 60 * 1000  //6h
// Controller for chat routes

function inactivityTimerManager(roomName) {
  if (timers[roomName]) clearTimeout(timers[roomName]);
  timers[roomName] = setTimeout(async () => {
    await Message.destroy({ where: { roomName } });
    await Room.destroy({ where: { roomName } });
    delete timers[roomName];
    console.log("Room deleted:", roomName);
  }, autoDeleteTimer);
}
const chatCtrl = {

  hostSendsMessage: async (req, res) => {
    const { hostToken, roomName, message } = req.body;
    if (!hostToken || !roomName || !message)
      return res.status(400).json({ error: 'Missing hostToken, roomName, or message' });
    const room = await Room.findOne({ where: { roomName, hostToken } });
    if (!room) {
      const targetRoom = await Room.findOne({ where: { roomName } })
      if (targetRoom) {
        const failedAuthAttemps = await targetRoom.failedAuth
        if (failedAuthAttemps == 3) {
          await Message.destroy({ where: { roomName } });
          await targetRoom.destroy();
          return res.status(403).json({ error: 'The room was destroyed because 3 failed attemps were detected' })
        }
        await targetRoom.update({ failedAuth: failedAuthAttemps + 1 });
    }
    return res.status(403).json({ error: 'Invalid room or hostToken' })
  }
    inactivityTimerManager(roomName)
    const pending = await Message.count({ where: { roomName, sender: 'host' } });
  if(pending >= 3)
return res.status(429).json({ error: 'Your partner has 3 pending messages: wait please' });
await Message.create({ roomName, sender: 'host', message, order: pending });
res.json({ success: true });
  },

joinerSendsMessage: async (req, res) => {
  const { joinerToken, roomName, message } = req.body;
  if (!joinerToken || !roomName || !message) {
    return res.status(400).json({ error: 'Missing joinerToken, roomName, or message' })
  };
  const room = await Room.findOne({ where: { roomName, joinerToken } });
  if (!room) {
    return res.status(403).json({ error: 'Invalid room or joinerToken' })
  };
  inactivityTimerManager(roomName)
  const pending = await Message.count({ where: { roomName, sender: 'joiner' } });
  if (pending >= 3) {
    return res.status(429).json({ error: 'Your partner has 3 pending messages: wait please' })
  };
  await Message.create({ roomName, sender: 'joiner', message, order: pending });
  res.json({ success: true });
},


  joinerAsksForMessage: async (req, res) => {
    const { joinerToken, roomName } = req.body;
    if (!joinerToken || !roomName)
      return res.status(400).json({ error: 'Missing joinerToken or roomName' });
    const room = await Room.findOne({ where: { roomName, joinerToken } });
    if (!room)
      return res.status(403).json({ error: 'Invalid room or joinerToken' });
    const encryptedMessages = await Message.findAll({
      where: { roomName, sender: "host" },
      order: [["order", "ASC"]]
    });
    if (encryptedMessages.length == 0) {
      return res.status(404).json({ error: 'New messages not found' });
    }
    await Message.destroy({
      where: {
        roomName, sender: "host"
      }
    })
    return res.status(200).json(encryptedMessages);
  },


    hostAsksForMessage: async (req, res) => {
      const { hostToken, roomName } = req.body;
      if (!hostToken || !roomName)
        return res.status(400).json({ error: 'Missing hostToken or roomName' });
      const room = await Room.findOne({ where: { roomName, hostToken } });
      if (!room)
        return res.status(403).json({ error: 'Invalid room or hostToken' });
      const encryptedMessages = await Message.findAll({
        where: { roomName, sender: "joiner" },
        order: [["order", "ASC"]]
      });
      if (encryptedMessages.length == 0) {
        return res.status(404).json({ error: 'New messages not found' });
      }
      await Message.destroy({
        where: {
          roomName, sender: "joiner"
        }
      })
      return res.status(200).json(encryptedMessages);
    },



      deleteRoom: async (req, res) => {
        const { token, roomName } = req.body;
        if (!token || !roomName)
          return res.status(400).json({ error: 'Missing token or roomName' });
        const room = await Room.findOne({
          where: {
            roomName,
            [Op.or]: { hostToken: token, joinerToken: token }
          }
        });
        if (!room)
          return res.status(403).json({ error: 'Invalid room or token' });
        if (timers[roomName]) {
          clearTimeout(timers[roomName]);
          delete timers[roomName];
        }
        await Message.destroy({ where: { roomName } });
        await room.destroy();
        res.status(200).json({ success: true });
      },
}

export default chatCtrl;