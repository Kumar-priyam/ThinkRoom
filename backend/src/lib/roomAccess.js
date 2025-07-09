import Room from "../models/Room.js";
import mongoose from "mongoose";

export async function allowUserInRoom(roomId, userId) {
  // Upsert the room and add userId to allowedUsers if not already present
  await Room.findOneAndUpdate(
    { roomId },
    { $addToSet: { allowedUsers: new mongoose.Types.ObjectId(userId) } },
    { upsert: true, new: true }
  );
}


export async function isUserAllowed(roomId, userId) {
  const room = await Room.findOne({ roomId });
  if (!room) return false;
  return room.allowedUsers.some(
    (uid) => uid.toString() === userId.toString()
  );
}

export async function removeUserFromRoom(roomId, userId) {
  await Room.findOneAndUpdate(
    { roomId },
    { $pull: { allowedUsers: new mongoose.Types.ObjectId(userId) } }
  );
}
