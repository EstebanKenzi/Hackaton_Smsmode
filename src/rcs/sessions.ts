import { readFile, rename, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Mutex } from 'async-mutex';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_PATH = join(__dirname, '../../data/sessions.json');
const sessionsMutex = new Mutex();

export interface CustomReply {
  command: string;
  reply: string;
}

export interface HistoryEntry {
  direction: 'in' | 'out';
  text: string;
  timestamp: number;
  senderName: string;
}

export interface PhoneSession {
  patientName?: string;
  customReplies: CustomReply[];
  history: HistoryEntry[];
}

export interface SessionsData {
  global: CustomReply[];
  sessions: Record<string, PhoneSession>;
}

async function loadSessions(): Promise<SessionsData> {
  try {
    const raw = await readFile(SESSIONS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { global: [], sessions: {} };
    }
    throw error;
  }
}

async function saveSessions(data: SessionsData): Promise<void> {
  const temporaryPath = `${SESSIONS_PATH}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf-8');
  await rename(temporaryPath, SESSIONS_PATH);
}

async function updateSessions(update: (data: SessionsData) => void): Promise<void> {
  await sessionsMutex.runExclusive(async () => {
    const data = await loadSessions();
    update(data);
    await saveSessions(data);
  });
}

function ensureSession(data: SessionsData, phone: string): void {
  if (!data.sessions[phone]) {
    data.sessions[phone] = { customReplies: [], history: [] };
  }
}

export async function addGlobalReply(command: string, reply: string): Promise<void> {
  await updateSessions(data => {
    const cmd = command.toLowerCase();
    data.global = data.global.filter(r => r.command !== cmd);
    data.global.push({ command: cmd, reply });
  });
}

export async function removeGlobalReply(command: string): Promise<void> {
  await updateSessions(data => {
    data.global = data.global.filter(r => r.command !== command.toLowerCase());
  });
}

export async function addPhoneReply(phone: string, command: string, reply: string): Promise<void> {
  await updateSessions(data => {
    ensureSession(data, phone);
    const cmd = command.toLowerCase();
    data.sessions[phone].customReplies = data.sessions[phone].customReplies.filter(r => r.command !== cmd);
    data.sessions[phone].customReplies.push({ command: cmd, reply });
  });
}

export async function removePhoneReply(phone: string, command: string): Promise<void> {
  await updateSessions(data => {
    if (!data.sessions[phone]) return;
    data.sessions[phone].customReplies = data.sessions[phone].customReplies.filter(
      r => r.command !== command.toLowerCase()
    );
  });
}

export async function findReply(command: string, phone: string): Promise<string | null> {
  const data = await loadSessions();
  const cmd = command.toLowerCase().trim();
  const perPhone = data.sessions[phone]?.customReplies.find(r => r.command === cmd);
  if (perPhone) return perPhone.reply;
  const global = data.global.find(r => r.command === cmd);
  return global?.reply ?? null;
}

export async function appendToHistory(phone: string, entry: HistoryEntry): Promise<void> {
  await updateSessions(data => {
    ensureSession(data, phone);
    data.sessions[phone].history.push(entry);
  });
}

export async function setPatientName(phone: string, name: string): Promise<void> {
  await updateSessions(data => {
    ensureSession(data, phone);
    data.sessions[phone].patientName = name;
  });
}

export async function getHistory(phone: string): Promise<HistoryEntry[]> {
  const data = await loadSessions();
  return data.sessions[phone]?.history ?? [];
}

export async function getAllReplies(): Promise<SessionsData> {
  return loadSessions();
}
