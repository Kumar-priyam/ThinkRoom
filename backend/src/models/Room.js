import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

const Room = mongoose.model("Room", roomSchema);
export default Room;
