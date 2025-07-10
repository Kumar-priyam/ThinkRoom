import express from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import authRoutes from "./routes/auth.route.js";
import userRoutes from "./routes/user.route.js";
import { connectDB } from "./lib/db.js";
import { isUserAllowed, allowUserInRoom, removeUserFromRoom } from "./lib/roomAccess.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

const PORT = process.env.PORT;
const __dirname = path.resolve();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true, // allow frontend to send cookies
  })
);

app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use(express.static(path.join(__dirname, "public")));

// --- SOCKET.IO EVENTS ---
// In-memory mapping for efficient lookups. For production, consider a more robust store like Redis.
const peerToSocketMap = {};
const socketToUserMap = {};
io.on("connection", (socket) => {
  console.log("A user connected: " + socket.id);
  // Join room with validation
  // Expects: { roomId, userId }
  socket.on("join-room", async ({ roomId, userId }) => {
    if (!roomId || !userId) {
      socket.emit("room-error", { message: "Missing roomId or userId" });
      return;
    }
    // Room validation: Only allow if user is permitted (customize as needed)
    const allowed = await isUserAllowed(roomId, userId);
    if (!allowed) {
      socket.emit("room-error", { message: "You are not allowed in this room." });
      return;
    }
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", userId);
  });

  socket.on("get-room-users", (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) { // Return more detailed user info including peerId
      const userDetails = Array.from(room).map(socketId => {
        const userSocket = io.sockets.sockets.get(socketId);
        return {
          userId: userSocket.userId,
          peerId: userSocket.peerId,
        };
      }).filter(user => user.userId); // Filter out users who haven't sent peer-ready yet
      io.to(roomId).emit("room-users", userDetails);
    }
  });

  // Allow user in room (admin/creator action, call this before join-room)
  // Expects: { roomId, userId }
  socket.on("allow-user-in-room", async ({ roomId, userId }) => {
    // Associate userId with this socket for later checks
    socket.userId = userId;
    await allowUserInRoom(roomId, userId);
    socket.emit("user-allowed", { roomId, userId });
  });

  // Chat message
  socket.on("chat-message", ({ roomId, message, user }) => {
    io.to(roomId).emit("chat-message", { message, user, socketId: socket.id });
  });

  socket.on("peer-ready", ({ roomId, peerId, userId }) => {
    socket.peerId = peerId;  // Associate peerId with the socket
    socket.userId = userId; // Associate userId with the socket
    peerToSocketMap[peerId] = socket.id;
    socketToUserMap[socket.id] = userId;
    console.log(`Peer ${peerId} is ready in room ${roomId}`);
    // Notify others that a new user's peer is ready
    socket.to(roomId).emit("peer-joined", { userId, peerId });
  });

  socket.on("start-call", async ({ roomId, targetPeerId }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room || room.size !== 2) {
      return socket.emit("call-error", { message: "Calls are only allowed in 1-on-1 rooms." });
    }

    const targetSocketId = peerToSocketMap[targetPeerId];
    const targetSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;

    if (!targetSocket) {
      return socket.emit("call-error", { message: "The other user is not available for a call." });
    }

    // Use isUserAllowed which implicitly checks friendship via roomAccess logic
    const callerIsAllowed = await isUserAllowed(roomId, socket.userId);
    const targetIsAllowed = await isUserAllowed(roomId, targetSocket.userId);

    if (callerIsAllowed && targetIsAllowed) {
      io.to(targetSocketId).emit("start-call", { peerId: socket.peerId }); // Send caller's peerId
    } else {
      socket.emit("call-error", { message: "You must be friends to call this user." });
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected: " + socket.id);
    // Clean up maps on disconnect to prevent stale data
    if (socket.peerId && peerToSocketMap[socket.peerId]) {
      delete peerToSocketMap[socket.peerId];
    }
    if (socket.userId && socketToUserMap[socket.id]) {
      delete socketToUserMap[socket.id];
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
});