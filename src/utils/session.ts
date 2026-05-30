interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Session {
  messages: SessionMessage[];
  lastActive: number;
}

const SESSION_TTL = 30 * 60 * 1000;
const MAX_HISTORY = 20;

const sessions = new Map<string, Session>();

function getSessionKey(conversationId: string, userId?: string): string {
  return userId ? `${conversationId}:${userId}` : conversationId;
}

export function getSessionMessages(conversationId: string, userId?: string): SessionMessage[] {
  const key = getSessionKey(conversationId, userId);
  const session = sessions.get(key);
  if (!session) return [];
  return session.messages;
}

export function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  userId?: string,
): void {
  const key = getSessionKey(conversationId, userId);
  let session = sessions.get(key);
  if (!session) {
    session = { messages: [], lastActive: Date.now() };
    sessions.set(key, session);
  }
  session.messages.push({ role, content });
  session.lastActive = Date.now();
  if (session.messages.length > MAX_HISTORY) {
    session.messages = session.messages.slice(-MAX_HISTORY);
  }
}

export function clearSession(conversationId: string, userId?: string): void {
  const key = getSessionKey(conversationId, userId);
  sessions.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.lastActive > SESSION_TTL) {
      sessions.delete(key);
    }
  }
}, 60_000);
