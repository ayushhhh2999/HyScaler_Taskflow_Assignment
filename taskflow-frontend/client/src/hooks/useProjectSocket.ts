import { useEffect, useRef } from "react";
import { getWebSocketAccessToken } from "@/lib/api";
import type { Comment, Member, Project, ProjectInvitation, Task } from "@/lib/types";

export type ProjectSocketEvent =
  | { type: "project.created"; project_id: string; payload: Project }
  | { type: "project.deleted"; project_id: string; payload: Project }
  | { type: "project.member_removed"; project_id: string; payload: { user_id: string } }
  | { type: "invitation.received"; project_id: string; payload: ProjectInvitation }
  | { type: "invitation.sent"; project_id: string; payload: ProjectInvitation }
  | { type: "invitation.cancelled"; project_id: string; payload: ProjectInvitation }
  | { type: "invitation.accepted"; project_id: string; payload: { invitation: ProjectInvitation; member: Member } }
  | { type: "invitation.rejected"; project_id: string; payload: { invitation: ProjectInvitation; member: null } }
  | { type: "task.created"; project_id: string; payload: Task }
  | { type: "task.updated"; project_id: string; payload: Task }
  | { type: "task.status_changed"; project_id: string; payload: Task }
  | { type: "task.deleted"; project_id: string; payload: { id: string } }
  | { type: "comment.created"; project_id: string; payload: { task_id: string; comment: Comment } }
  | { type: "member.added"; project_id: string; payload: Member }
  | { type: "member.removed"; project_id: string; payload: { user_id: string } };

function getWsBaseUrl() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
  const httpBase = apiBase.replace(/\/api\/v1\/?$/, "");
  return httpBase.replace(/^http/i, "ws");
}

function useRealtimeSocket(path: string | undefined, onEvent: (event: ProjectSocketEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!path) return;

    let socket: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;

    const connect = async () => {
      if (closed) return;
      const token = await getWebSocketAccessToken();
      if (closed) return;
      if (!token) return;

      socket = new WebSocket(`${getWsBaseUrl()}${path}?token=${encodeURIComponent(token)}`);

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as ProjectSocketEvent;
          if (event?.type) handlerRef.current(event);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = (event) => {
        if (closed) return;
        if (event.code === 1008) return;
        const delay = Math.min(10000, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [path]);
}

const userSocketSubscribers = new Set<(event: ProjectSocketEvent) => void>();
let sharedUserSocket: WebSocket | null = null;
let userSocketReconnectTimer: number | undefined;
let userSocketAttempt = 0;
let userSocketGeneration = 0;
let userSocketConnecting = false;

function startSharedUserSocket() {
  if (sharedUserSocket || userSocketConnecting || userSocketSubscribers.size === 0) return;
  userSocketConnecting = true;
  const generation = userSocketGeneration;

  void getWebSocketAccessToken().then((token) => {
    userSocketConnecting = false;
    if (!token || generation !== userSocketGeneration || userSocketSubscribers.size === 0) return;

    const socket = new WebSocket(`${getWsBaseUrl()}/ws/users?token=${encodeURIComponent(token)}`);
    sharedUserSocket = socket;
    socket.onopen = () => {
      userSocketAttempt = 0;
    };
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as ProjectSocketEvent;
        if (event?.type) userSocketSubscribers.forEach((subscriber) => subscriber(event));
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = (event) => {
      if (sharedUserSocket === socket) sharedUserSocket = null;
      if (generation !== userSocketGeneration || userSocketSubscribers.size === 0 || event.code === 1008) return;
      const delay = Math.min(10000, 1000 * 2 ** userSocketAttempt);
      userSocketAttempt += 1;
      userSocketReconnectTimer = window.setTimeout(() => {
        userSocketReconnectTimer = undefined;
        startSharedUserSocket();
      }, delay);
    };
  }).catch(() => {
    userSocketConnecting = false;
  });
}

function stopSharedUserSocketIfUnused() {
  if (userSocketSubscribers.size > 0) return;
  userSocketGeneration += 1;
  userSocketConnecting = false;
  userSocketAttempt = 0;
  if (userSocketReconnectTimer) window.clearTimeout(userSocketReconnectTimer);
  userSocketReconnectTimer = undefined;
  const socket = sharedUserSocket;
  sharedUserSocket = null;
  socket?.close();
}

export function useProjectSocket(projectId: string | undefined, onEvent: (event: ProjectSocketEvent) => void) {
  useRealtimeSocket(projectId ? `/ws/projects/${projectId}` : undefined, onEvent);
}

export function useUserSocket(onEvent: (event: ProjectSocketEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const subscriber = (event: ProjectSocketEvent) => handlerRef.current(event);
    userSocketSubscribers.add(subscriber);
    startSharedUserSocket();
    return () => {
      userSocketSubscribers.delete(subscriber);
      stopSharedUserSocketIfUnused();
    };
  }, []);
}
