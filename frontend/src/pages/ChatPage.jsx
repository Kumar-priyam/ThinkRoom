
import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import toast from "react-hot-toast";
import io from "socket.io-client";
import ChatLoader from "../components/ChatLoader";
import CallButton from "../components/CallButton";


const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const ChatPage = () => {
  const { id: targetUserId } = useParams();
  const { authUser } = useAuthUser();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const roomId = [authUser?._id, targetUserId].sort().join("-");

  useEffect(() => {
    if (!authUser || !targetUserId) return;
    setLoading(true);
    // Connect to socket.io server
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    // Robust connection event handling
    socket.on("connect", () => {
      toast.success("Connected to chat server");
      // Allow user in room (should be done by admin/creator, here for demo)
      socket.emit("allow-user-in-room", { roomId, userId: authUser._id });
      // Join room
      socket.emit("join-room", { roomId, userId: authUser._id });
    });
    socket.on("disconnect", () => {
      toast.error("Disconnected from chat server");
    });
    socket.on("reconnect_attempt", () => {
      toast("Reconnecting to chat server...");
    });
    socket.on("reconnect", () => {
      toast.success("Reconnected to chat server");
    });
    socket.on("connect_error", (err) => {
      toast.error("Connection error: " + err.message);
    });
    socket.on("reconnect_error", (err) => {
      toast.error("Reconnect error: " + err.message);
    });
    socket.on("reconnect_failed", () => {
      toast.error("Failed to reconnect to chat server");
    });

    socket.on("room-error", (data) => {
      toast.error(data.message);
    });

    socket.on("chat-message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("user-joined", (userId) => {
      toast.success(`User joined: ${userId}`);
    });

    setLoading(false);

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line
  }, [authUser, targetUserId]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const msg = {
      roomId,
      message: input,
      user: {
        _id: authUser._id,
        name: authUser.fullName,
        profilePic: authUser.profilePic,
      },
    };
    socketRef.current.emit("chat-message", msg);
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    setInput("");
  };

  const handleVideoCall = () => {
    // For demo: just send a message with a call link
    const callUrl = `${window.location.origin}/call/${roomId}`;
    const msg = {
      roomId,
      message: `I've started a video call. Join me here: ${callUrl}`,
      user: {
        _id: authUser._id,
        name: authUser.fullName,
        profilePic: authUser.profilePic,
      },
    };
    socketRef.current.emit("chat-message", msg);
    setMessages((prev) => [...prev, { ...msg, self: true }]);
    toast.success("Video call link sent successfully!");
  };

  if (loading) return <ChatLoader />;

  return (
    <div className="h-[93vh] flex flex-col">
      <CallButton handleVideoCall={handleVideoCall} />
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.self ? "justify-end" : "justify-start"}`}
          >
            <div className="bg-base-200 rounded-lg px-4 py-2 max-w-xl">
              <span className="font-bold">{msg.user?.name || "User"}:</span> {msg.message}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSend} className="flex p-2 border-t">
        <input
          className="input input-bordered flex-1 mr-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />
        <button className="btn btn-primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatPage;
