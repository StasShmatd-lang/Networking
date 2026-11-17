import { useEffect, useState } from "react";
import { getSocket } from "../socket";
import type { ChatMessage, EventState } from "../types";

type Role = "host" | "guest" | "screen";

export function useEventSocket(eventId: string | undefined, role: Role) {
  const [state, setState] = useState<EventState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (s: EventState) => {
      setState(s);
      if (Array.isArray(s.chat)) setChat(s.chat);
      setError(null);
    };
    const onChat = (payload: { message: ChatMessage }) => {
      setChat((prev) => [...prev, payload.message].slice(-80));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("state", onState);
    socket.on("chat", onChat);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("state", onState);
      socket.off("chat", onChat);
    };
  }, [eventId, role]);

  return { state, setState, error, setError, chat, setChat, connected };
}
