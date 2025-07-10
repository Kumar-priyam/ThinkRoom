import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import toast from "react-hot-toast";
import io from "socket.io-client";
import ChatLoader from "../components/ChatLoader";
import CallButton from "../components/CallButton";

import Peer from "peerjs";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const ChatPage = () => {
  const { id: targetUserId } = useParams();
  const { authUser } = useAuthUser();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [roomUsers, setRoomUsers] = useState([]);
  const socketRef = useRef(null);
  const roomId = [authUser?._id, targetUserId].sort().join("-");
  const peerRef = useRef(null); // PeerJS instance
  const [callActive, setCallActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isCaller, setIsCaller] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);

  useEffect(() => {
    if (!authUser || !targetUserId) return;
    setLoading(true);
    // Connect to socket.io server
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    // Robust connection event handling
    socket.on("connect", () => {
      toast.success("Connected to chat server!");
      // Allow user in room (should be done by admin/creator, here for demo)
      socket.emit("allow-user-in-room", { roomId, userId: authUser._id });
      // Join room
      socket.emit("join-room", { roomId, userId: authUser._id });
      socket.emit("get-room-users", { roomId });
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


    // Listen for user-joined and update room users
    socket.on("user-joined", () => {
      toast.success(`User joined`);
      // We will get the full user list from get-room-users, so we just trigger a fetch
      socket.emit("get-room-users", { roomId });
    });

    // Listen for initial user list (optional, if backend emits it)
    socket.on("room-users", (users) => {
      // Filter out the current user to easily get the other user's info
      const otherUsers = users.filter(u => u.userId !== authUser._id);
      setRoomUsers(otherUsers);
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

  const initializePeer = useCallback(() => {
    if (peerRef.current) return;  // Only initialize once per session
    const peer = new Peer(undefined, { config: ICE_SERVERS });
    peerRef.current = peer;

    peer.on("open", (id) => {
      console.log("Peer connected with ID:", id);
      // When the peer connection opens, let the server know it's ready for calls.
      socketRef.current.emit("peer-ready", { roomId, peerId: id, userId: authUser._id });
    });

    peer.on("call", (call) => {
      console.log("Received a call:", call);
      setActiveCall(call);
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          setLocalStream(stream);
          call.answer(stream); // Answer the call with our stream
          setCallActive(true);
          setIsCaller(false);
          call.on("stream", (remoteStream) => {
            console.log("Received remote stream:", remoteStream);
            setRemoteStream(remoteStream);
          });
        })
        .catch((err) => {
          console.error("Failed to get user media:", err);
          toast.error("Failed to access camera/microphone.");
        });
    });

    peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      toast.error("Video call error: " + err.message);
      setCallActive(false);
      setLocalStream(null);
      setRemoteStream(null);
      setIsCaller(false);
    });

    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    }
  }, [authUser, roomId]);

  const cleanupCall = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = null;
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) remoteVideo.srcObject = null;

    setCallActive(false);
    setLocalStream(null);
    setRemoteStream(null);
    setIsCaller(false);
    setAudioMuted(false);
    setVideoMuted(false);
    setActiveCall(null);
    console.log("Call cleaned up.");
  }, [localStream]);

  const handleHangUp = useCallback(() => {
    if (activeCall) {
      activeCall.close();
    }
    cleanupCall();
  }, [activeCall, cleanupCall]);

  const toggleAudioMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setAudioMuted((prev) => !prev);
    }
  }, [localStream]);

  const toggleVideoMute = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setVideoMuted((prev) => !prev);
    }
  }, [localStream]);

  const handleVideoCall = useCallback(async (peerId) => {
    if (callActive) {
      toast.error("A call is already in progress.");
      return;
    }

    if (!peerRef.current || !peerRef.current.open) {
      toast.error("Peer connection not ready.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      const call = peerRef.current.call(peerId, stream);
      setActiveCall(call);
      console.log("Initiating call to peer:", peerId);
      setCallActive(true);
      setIsCaller(true);

      call.on("stream", (remoteStream) => {
        console.log("Received remote stream:", remoteStream);
        setRemoteStream(remoteStream);
      });

      call.on("close", () => {
        console.log("Call ended.");
        cleanupCall();
      });
    } catch (err) {
      console.error("Error starting call:", err);
      toast.error("Failed to start video call: " + err.message);
    }
  }, [callActive, cleanupCall]);

  useEffect(() => {
    if (socketRef.current && authUser) {
      initializePeer();

      const handleIncomingCall = ({ peerId }) => {
        handleVideoCall(peerId);
      };

      socketRef.current.on("start-call", handleIncomingCall);

      return () => {
        socketRef.current?.off("start-call", handleIncomingCall);
      }
    }
  }, [authUser, initializePeer, handleVideoCall]);

  useEffect(() => {
    if (callActive && localStream) {
        const videoElement = document.getElementById('localVideo');
        if (videoElement) videoElement.srcObject = localStream;
    }
  }, [callActive, localStream]);

  useEffect(() => {
    if (callActive && remoteStream) {
        const videoElement = document.getElementById('remoteVideo');
        if (videoElement) videoElement.srcObject = remoteStream;
    }
  }, [callActive, remoteStream]);

  if (loading) return <ChatLoader />;

  return (
    <div className="h-[93vh] flex flex-col">
      {/* Show number of users in the room */}
      <div className="p-2 text-sm text-right text-gray-500">
        Users in room: {roomUsers.length > 0 ? roomUsers.length : 1}
      </div>
      {/* Only show CallButton if room is private (2 users) */}
      {!callActive && roomUsers.length === 1 && roomUsers[0].peerId && (
        <CallButton handleVideoCall={() => socketRef.current.emit("start-call", { roomId, targetPeerId: roomUsers[0].peerId })} />
      )}
      {callActive && (
        <>
          <div className="flex justify-center items-center">
            <div className="p-4">
              <video id="localVideo" muted autoPlay className="w-64 h-48 bg-black"></video>
            </div>
            <div className="p-4">
              <video id="remoteVideo" autoPlay className="w-64 h-48 bg-black"></video>
            </div>
          </div>
          <div className="flex justify-center p-2 space-x-2">
            <button
              className={`btn ${audioMuted ? "btn-warning" : "btn-neutral"}`}
              onClick={toggleAudioMute}
            >
              {audioMuted ? "Unmute" : "Mute"} Audio
            </button>
            <button className={`btn ${videoMuted ? "btn-warning" : "btn-neutral"}`} onClick={toggleVideoMute}>
              {videoMuted ? "Show" : "Hide"} Video
            </button>
            <button className="btn btn-error" onClick={handleHangUp}> Hang Up </button>
          </div>
        </>
      )}
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
