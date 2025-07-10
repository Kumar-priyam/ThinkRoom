
import Room from "../models/Room.js";
import mongoose from "mongoose";
import User from "../models/User.js";

/**
 * Only allow userId to join room if all other users in the room are friends with userId and vice versa.
 * For 1:1 rooms, only allow if both users are friends.
 * For group rooms, all users must be mutual friends.
 */
export async function allowUserInRoom(roomId, userId) {
  // Find the room (if exists) and get all allowed users
  let room = await Room.findOne({ roomId });
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // If room doesn't exist, allow first user in
  if (!room) {
    await Room.findOneAndUpdate(
      { roomId },
      { $addToSet: { allowedUsers: userObjectId } },
      { upsert: true, new: true }
    );
    return;
  }

  // Get all users currently in the room
  const otherUserIds = room.allowedUsers.map((uid) => uid.toString());
  if (otherUserIds.length === 0) {
    // No one in room, allow
    await Room.findOneAndUpdate(
      { roomId },
      { $addToSet: { allowedUsers: userObjectId } },
      { upsert: true, new: true }
    );
    return;
  }

  // Fetch user and all other users in the room
  const user = await User.findById(userId);
  const userFriends = user.friends.map((id) => id.toString());

  // 1:1 room: both users must be friends
  if (otherUserIds.length === 1) {
    const otherUserId = otherUserIds[0];
    if (!userFriends.includes(otherUserId)) {
      throw new Error("You must be friends with the other user to join this room.");
    }
  }
  // Group room: user must be friends with all existing members.
  else if (otherUserIds.length > 1) {
    const areFriendsWithAll = otherUserIds.every((otherId) =>
      userFriends.includes(otherId)
    );
    if (!areFriendsWithAll) {
      throw new Error(
        "You must be friends with all existing members to join this group room."
      );
    }
  }

  // All checks passed, allow user in room
  await Room.findOneAndUpdate(
    { roomId },
    { $addToSet: { allowedUsers: userObjectId } },
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
