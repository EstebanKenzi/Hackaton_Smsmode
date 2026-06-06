import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS_PATH = join(__dirname, '../data/sessions.json');

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
  } catch {
    return { global: [], sessions: {} };
  }
}

async function saveSessions(data: SessionsData): Promise<void> {
  await writeFile(SESSIONS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function ensureSession(data: SessionsData, phone: string): void {
  if (!data.sessions[phone]) {
    data.sessions[phone] = { customReplies: [], history: [] };
  }
}

export async function addGlobalReply(command: string, reply: string): Promise<void> {
  const data = await loadSessions();
  const cmd = command.toLowerCase();
  data.global = data.global.filter(r => r.command !== cmd);
  data.global.push({ command: cmd, reply });
  await saveSessions(data);
}

export async function removeGlobalReply(command: string): Promise<void> {
  const data = await loadSessions();
  data.global = data.global.filter(r => r.command !== command.toLowerCase());
  await saveSessions(data);
}

export async function addPhoneReply(phone: string, command: string, reply: string): Promise<void> {
  const data = await loadSessions();
  ensureSession(data, phone);
  const cmd = command.toLowerCase();
  data.sessions[phone].customReplies = data.sessions[phone].customReplies.filter(r => r.command !== cmd);
  data.sessions[phone].customReplies.push({ command: cmd, reply });
  await saveSessions(data);
}

export async function removePhoneReply(phone: string, command: string): Promise<void> {
  const data = await loadSessions();
  if (!data.sessions[phone]) return;
  data.sessions[phone].customReplies = data.sessions[phone].customReplies.filter(
    r => r.command !== command.toLowerCase()
  );
  await saveSessions(data);
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
  const data = await loadSessions();
  ensureSession(data, phone);
  data.sessions[phone].history.push(entry);
  await saveSessions(data);
}

export async function setPatientName(phone: string, name: string): Promise<void> {
  const data = await loadSessions();
  ensureSession(data, phone);
  data.sessions[phone].patientName = name;
  await saveSessions(data);
}

export async function getHistory(phone: string): Promise<HistoryEntry[]> {
  const data = await loadSessions();
  return data.sessions[phone]?.history ?? [];
}

export async function getAllReplies(): Promise<SessionsData> {
  return loadSessions();
}
