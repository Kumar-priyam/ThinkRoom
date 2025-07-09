
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import toast from "react-hot-toast";
import io from "socket.io-client";
import PageLoader from "../components/PageLoader";


const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const CallPage = () => {
  const { id: callId } = useParams();
  const { authUser } = useAuthUser();
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const roomId = callId;

  useEffect(() => {
    if (!authUser || !roomId) return;
    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    // Robust connection event handling
    socket.on("connect", () => {
      toast.success("Connected to call server");
      socket.emit("allow-user-in-room", { roomId, userId: authUser._id });
      socket.emit("join-room", { roomId, userId: authUser._id });
    });
    socket.on("disconnect", () => {
      toast.error("Disconnected from call server");
    });
    socket.on("reconnect_attempt", () => {
      toast("Reconnecting to call server...");
    });
    socket.on("reconnect", () => {
      toast.success("Reconnected to call server");
    });
    socket.on("connect_error", (err) => {
      toast.error("Connection error: " + err.message);
    });
    socket.on("reconnect_error", (err) => {
      toast.error("Reconnect error: " + err.message);
    });
    socket.on("reconnect_failed", () => {
      toast.error("Failed to reconnect to call server");
    });

    // WebRTC signaling handlers
    socket.on("webrtc-offer", async (data) => {
      await handleReceiveOffer(data);
    });
    socket.on("webrtc-answer", async (data) => {
      await handleReceiveAnswer(data);
    });
    socket.on("webrtc-ice-candidate", async (data) => {
      if (peerRef.current) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Error adding received ice candidate", e);
        }
      }
    });

    return () => {
      socket.disconnect();
      if (localStream) localStream.getTracks().forEach((track) => track.stop());
      if (remoteStream) remoteStream.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line
  }, [authUser, roomId]);

  const startCall = async () => {
    setIsCalling(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const peer = new RTCPeerConnection();
    peerRef.current = peer;

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("webrtc-ice-candidate", {
          roomId,
          candidate: event.candidate,
        });
      }
    };

    peer.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socketRef.current.emit("webrtc-offer", { roomId, offer });
  };

  const handleReceiveOffer = async (data) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const peer = new RTCPeerConnection();
    peerRef.current = peer;

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("webrtc-ice-candidate", {
          roomId,
          candidate: event.candidate,
        });
      }
    };

    peer.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socketRef.current.emit("webrtc-answer", { roomId, answer });
  };

  const handleReceiveAnswer = async (data) => {
    if (peerRef.current) {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center">
      <div className="flex flex-col gap-4">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-80 h-60 bg-black rounded" />
        <video ref={remoteVideoRef} autoPlay playsInline className="w-80 h-60 bg-black rounded" />
        {!isCalling && (
          <button className="btn btn-primary" onClick={startCall}>
            Start Call
          </button>
        )}
      </div>
    </div>
  );
};

export default CallPage;
