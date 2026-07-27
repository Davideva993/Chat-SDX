import { rooms } from "./keyExchange.js";

const serverChallengeCtrl = {

  startChallenge: async (req, res) => {
    const { roomName, token } = req.body;
    if (!roomName || !token) {
      return res.status(400).json({ error: "Missing roomName or token" });
    }
    const room = rooms.get(roomName);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.hostToken !== token && room.joinerToken !== token) {
      return res.status(403).json({ error: "Invalid token" });
    }
    room.challengeActive = true;
    room.serverAnswer = null;
    return res.status(200).json({ success: true });
  },

  serverCheckChallenge: async (req, res) => {
    if (req.body.password !== process.env.SERVER_PASSWORD) {
      return res.status(403).json({ error: "Invalid password" });
    }
    const activeRooms = [];
    for (const [name, room] of rooms) {
      if (room.challengeActive) {
        activeRooms.push({
          roomName: name,
          challengeActive: true,
        });
      }
    }
    return res.status(200).json({ activeRooms });
  },

  serverAnswerChallenge: async (req, res) => {
    if (req.body.password !== process.env.SERVER_PASSWORD) {
      return res.status(403).json({ error: "Invalid password" });
    }
    const { roomName, fruit } = req.body;
    if (!roomName || !fruit) {
      return res.status(400).json({ error: "Missing roomName or fruit" });
    }
    const room = rooms.get(roomName);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (!room.challengeActive) {
      return res.status(400).json({ error: "No active challenge" });
    }
    room.serverAnswer = fruit;
    return res.status(200).json({ success: true });
  },

  endChallenge: async (req, res) => {
    const { roomName, token, hostAnswer, joinerAnswer } = req.body;
    if (!roomName || !token || hostAnswer === undefined || joinerAnswer === undefined) {
      return res.status(400).json({ error: "Missing roomName, token, hostAnswer, or joinerAnswer" });
    }
    const room = rooms.get(roomName);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.hostToken !== token && room.joinerToken !== token) {
      return res.status(403).json({ error: "Invalid token" });
    }
    const serverAnswer = room.serverAnswer || null;
    room.challengeResults = { serverAnswer, hostAnswer, joinerAnswer };
    room.challengeActive = false;
    room.serverAnswer = null;
    return res.status(200).json({ serverAnswer, hostAnswer, joinerAnswer });
  },

  serverReadAnswers: async (req, res) => {
    if (req.body.password !== process.env.SERVER_PASSWORD) {
      return res.status(403).json({ error: "Invalid password" });
    }
    const { roomName } = req.body;
    if (!roomName) {
      return res.status(400).json({ error: "Missing roomName" });
    }
    const room = rooms.get(roomName);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    if (room.challengeResults) {
      const results = room.challengeResults;
      room.challengeResults = null;
      return res.status(200).json({ results });
    }
    return res.status(200).json({ results: null });
  },
};

export default serverChallengeCtrl;
