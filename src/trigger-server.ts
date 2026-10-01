import express from 'express';
import { SmsmodeRcsClient, parseWebhookPayload, isIncomingMessage } from '@smsmode/rcs';
import { RcsIncomingMessagePayload } from '@smsmode/rcs';
import { config, requireRcsConfig } from './config.js';
import { getAllSlots } from './slots.js';
import { addGlobalReply, removeGlobalReply, addPhoneReply, removePhoneReply, getAllReplies, getHistory } from './rcs/sessions.js';
import { DoctorAppointement } from './rcs/DoctorAppointement.js';
import { MapAssistant } from './rcs/map.js';

const app = express();
app.use(express.json());

const apiKey = config.apiKey;
const client = apiKey ? new SmsmodeRcsClient({ apiKey }) : null;
const companyName = config.companyName || 'Cabinet Médical';
const companyDestination = config.companyAddress || companyName;

const sessions = new Map<string, DoctorAppointement>();
const mapAssistants = new Map<string, MapAssistant>();

async function initSessionsForBookedSlots() {
  if (!client) return;
  try {
    const slots = await getAllSlots();
    const bookedPhones = new Set<string>(
      slots
        .filter((s: any) => s.booked && s.bookedBy)
        .map((s: any) => s.bookedBy as string)
    );
    for (const phone of bookedPhones) {
      if (!sessions.has(phone)) {
        createSession(phone);
        console.log(`Session chargée pour ${phone}`);
      }
    }
    console.log(`${sessions.size} session(s) chargée(s) depuis les créneaux réservés`);
  } catch (err) {
    console.error('Erreur initialisation sessions:', err);
  }
}

app.post('/send-rcs', async (req, res) => {
  const { phone, type } = req.body as { phone?: string; type?: string };

  if (!phone || !/^\d+$/.test(phone)) {
    res.status(400).json({ error: 'Numéro de téléphone invalide' });
    return;
  }

  if (!client) {
    res.status(500).json({ error: 'API_KEY manquante: configurez la clé SMSMode dans env/.env.keys ou .env' });
    return;
  }

  try {
    requireRcsConfig();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
    return;
  }

  const appointmentType = type ?? 'doctor';
  if (appointmentType !== 'doctor') {
    res.status(400).json({ error: `Type inconnu: "${appointmentType}". Types supportés: doctor` });
    return;
  }

  try {
    const session = createSession(phone);
    await session.askForAppointment();
    res.json({ message: 'Message RCS en cours d\'envoi', phone, type: appointmentType });
  } catch (err) {
    console.error('Erreur envoi RCS:', err);
    res.status(500).json({ error: 'Erreur lors de l\'envoi' });
  }
});

function createSession(phone: string): DoctorAppointement {
  const map = new MapAssistant(true, phone, client!, companyName, companyDestination);
  const session = new DoctorAppointement(true, phone, client!, map, companyName);
  mapAssistants.set(phone, map);
  sessions.set(phone, session);
  return session;
}

function getOrCreateSession(payload: RcsIncomingMessagePayload): DoctorAppointement | null {
  if (!client) return null;
  const phone = payload.recipient.to;
  if (!sessions.has(phone)) {
    console.log(`Session créée à la volée pour ${phone}`);
    createSession(phone);
  }
  return sessions.get(phone)!;
}

app.post('/webhook/rcs', async (req, res) => {
  console.log('Webhook reçu:', JSON.stringify(req.body, null, 2));
  try {
    const payload = parseWebhookPayload(req.body);
    if (isIncomingMessage(payload)) {
      const postbackData = (payload.body as any).postbackData ?? payload.body.text;
      console.log(`Message entrant — phone: ${payload.recipient.to}, data: ${postbackData}`);
      const phone = payload.recipient.to;
      const session = getOrCreateSession(payload);
      if (session) {
        const handled = await session.waitForScheduleResponse(postbackData);
        if (!handled) {
          const mapAssistant = mapAssistants.get(phone);
          if (mapAssistant) await mapAssistant.waitForLocationResponse(payload);
        }
      }
    }
  } catch (e) {
    console.error('Webhook invalide:', e);
  }
  res.sendStatus(200);
});

app.get('/api/slots', async (_req, res) => {
  try {
    const slots = await getAllSlots();
    res.json(slots);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/replies', async (_req, res) => {
  try {
    const data = await getAllReplies();
    res.json({ global: data.global, sessions: Object.fromEntries(
      Object.entries(data.sessions).map(([phone, s]) => [phone, s.customReplies])
    )});
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/replies/global', async (req, res) => {
  const { command, reply } = req.body;
  if (!command || !reply) { res.status(400).json({ error: 'command et reply requis' }); return; }
  await addGlobalReply(command, reply);
  res.json({ message: 'Réponse globale ajoutée' });
});

app.delete('/api/replies/global/:command', async (req, res) => {
  await removeGlobalReply(req.params.command);
  res.json({ message: 'Réponse globale supprimée' });
});

app.post('/api/replies/:phone', async (req, res) => {
  const { command, reply } = req.body;
  if (!command || !reply) { res.status(400).json({ error: 'command et reply requis' }); return; }
  await addPhoneReply(req.params.phone, command, reply);
  res.json({ message: 'Réponse ajoutée' });
});

app.delete('/api/replies/:phone/:command', async (req, res) => {
  await removePhoneReply(req.params.phone, req.params.command);
  res.json({ message: 'Réponse supprimée' });
});

app.get('/api/sessions/:phone/history', async (req, res) => {
  const history = await getHistory(req.params.phone);
  res.json(history);
});

app.listen(4000, async () => {
  console.log('Trigger server lancé sur http://localhost:4000');
  await initSessionsForBookedSlots();
});
