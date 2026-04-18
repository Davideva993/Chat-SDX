import { Room, Message } from '../models/db.js';
import { Op } from 'sequelize';
const timers = {};
import { sequelize } from '../models/db.js';
const autoDeleteTimer = 6 * 60 * 60 * 1000  //6h
// Controller for chat routes

function inactivityTimerManager(roomName) {
  if (timers[roomName]) clearTimeout(timers[roomName]);
  timers[roomName] = setTimeout(async () => {
    await Message.destroy({ where: { roomName } });
    await Room.destroy({ where: { roomName } });
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
      const result = await sequelize.transaction({ type: 'IMMEDIATE' }, async (t) => {
        const room = await Room.findOne({
          where: { roomName, hostToken },
          transaction: t
        });
        if (room && !room.acceptMessage) {
          return {
            status: 429,
            error: 'There is at least one new message for you: retrieve it first'
          };
        }
        else if (room && room.acceptMessage) { await room.update({ acceptMessage: false }, { transaction: t }); }
        else if (!room) {
          const targetRoom = await Room.findOne({
            where: { roomName },
            transaction: t
          });
          if (targetRoom) {
            const failedAttempts = targetRoom.failedAuth || 0;
            if (failedAttempts >= 3) {
              await Message.destroy({ where: { roomName }, transaction: t });
              await targetRoom.destroy({ transaction: t });
              return { status: 403, error: 'The room was destroyed because 3 failed attempts were detected' };
            }
            await targetRoom.update({ failedAuth: failedAttempts + 1 }, { transaction: t });
          }
          return { status: 403, error: 'Invalid room or hostToken' };
        }
        const myPending = await Message.count({
          where: { roomName, sender: 'host' },
          transaction: t
        });
        if (myPending >= 3) {
          await room.update({ acceptMessage: true }, { transaction: t });
          return {
            status: 429,
            error: 'Your partner has 3 pending messages: wait please'
          };
        }
        await Message.create({
          roomName,
          sender: 'host',
          message,
          order: myPending
        }, { transaction: t });
        await room.update({ acceptMessage: true }, { transaction: t });
        inactivityTimerManager(roomName);
        return { success: true };
      });
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
           const result = await sequelize.transaction({ type: 'IMMEDIATE' }, async (t) => {
          const room = await Room.findOne({
            where: { roomName, joinerToken },
            transaction: t
          });
          if (room && !room.acceptMessage) {
            return {
              status: 429,
              error: 'There is at least one new message for you: retrieve it first'
            };
          }
          else if (room && room.acceptMessage) {
            await room.update({ acceptMessage: false }, { transaction: t });
          }
          else if (!room) {
            const targetRoom = await Room.findOne({
              where: { roomName },
              transaction: t
            });
            if (targetRoom) {
              const failedAttempts = targetRoom.failedAuth || 0;
              if (failedAttempts >= 3) {
                await Message.destroy({ where: { roomName }, transaction: t });
                await targetRoom.destroy({ transaction: t });
                return {
                  status: 403,
                  error: 'The room was destroyed because 3 failed attempts were detected'
                };
              }
              await targetRoom.update(
                { failedAuth: failedAttempts + 1 },
                { transaction: t }
              );
            }
            return { status: 403, error: 'Invalid room or joinerToken' };
          }
          const myPending = await Message.count({
            where: { roomName, sender: 'joiner' },
            transaction: t
          });
          if (myPending >= 3) {
            await room.update({ acceptMessage: true }, { transaction: t });
            return {
              status: 429,
              error: 'Your partner has 3 pending messages: wait please'
            };
          }
          await Message.create({
            roomName,
            sender: 'joiner',
            message,
            order: myPending
          }, { transaction: t });
          await room.update({ acceptMessage: true }, { transaction: t });
          inactivityTimerManager(roomName);
          return { success: true };
        })
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
    const room = await Room.findOne({ where: { roomName, hostToken } });
    if (!room) {
      const targetRoom = await Room.findOne({ where: { roomName } })
      if (targetRoom) {
        const failedAuthAttemps = await targetRoom.failedAuth
        if (failedAuthAttemps >= 3) {
          await Message.destroy({ where: { roomName } });
          await targetRoom.destroy();
          return res.status(403).json({ error: 'The room was destroyed because 3 failed attemps were detected' })
        }
        await targetRoom.update({ failedAuth: failedAuthAttemps + 1 });

      }
      return res.status(403).json({ error: 'Invalid room or hostToken' })
    }
    const encryptedMessages = await Message.findAll({
      where: { roomName, sender: "joiner" },
      order: [["order", "ASC"]]
    });
    if (encryptedMessages.length == 0) {
      return res.status(404).json({ warn: 'New messages not found' });
    }
    await Message.destroy({
      where: {
        roomName, sender: "joiner"
      }
    })
    return res.status(200).json(encryptedMessages);
  },
joinerAsksForMessage: async (req, res) => {
    const { joinerToken, roomName } = req.body;
    if (!joinerToken || !roomName)
      return res.status(400).json({ error: 'Missing joinerToken or roomName' });
    const room = await Room.findOne({ where: { roomName, joinerToken } });
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
      return res.status(403).json({ error: 'Invalid room or joinerToken' })
    }
    const encryptedMessages = await Message.findAll({
      where: { roomName, sender: "host" },
      order: [["order", "ASC"]]
    });
    if (encryptedMessages.length == 0) {
      return res.status(404).json({ warn: 'New messages not found' });
    }
    await Message.destroy({
      where: {
        roomName, sender: "host"
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