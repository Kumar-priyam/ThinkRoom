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

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend", "dist", "index.html"));
  });
}


// --- SOCKET.IO EVENTS ---

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

  // Allow user in room (admin/creator action, call this before join-room)
  // Expects: { roomId, userId }
  socket.on("allow-user-in-room", async ({ roomId, userId }) => {
    await allowUserInRoom(roomId, userId);
    socket.emit("user-allowed", { roomId, userId });
  });

  // Chat message
  socket.on("chat-message", ({ roomId, message, user }) => {
    io.to(roomId).emit("chat-message", { message, user, socketId: socket.id });
  });

  // WebRTC signaling
  socket.on("webrtc-offer", (data) => {
    socket.to(data.roomId).emit("webrtc-offer", data);
  });
  socket.on("webrtc-answer", (data) => {
    socket.to(data.roomId).emit("webrtc-answer", data);
  });
  socket.on("webrtc-ice-candidate", (data) => {
    socket.to(data.roomId).emit("webrtc-ice-candidate", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected: " + socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  connectDB();
});
