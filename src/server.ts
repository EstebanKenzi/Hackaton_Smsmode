import express from 'express';
import dotenv from 'dotenv';
import { SmsmodeRcsClient, parseWebhookPayload, isIncomingMessage } from '@smsmode/rcs';
import { DoctorAppointement } from './rcs/DoctorAppointement.js';
import { MapAssistant } from './rcs/map.js';
import { getAllSlots, getAvailableSlots, bookSlot, getSlotById } from './slots.js';
import { generateCalendarFile } from './calendar.js';
import { createNotificationManager } from './notifications.js';
import { addGlobalReply, removeGlobalReply, addPhoneReply, removePhoneReply, getAllReplies, getHistory } from './rcs/sessions.js';
dotenv.config();
dotenv.config({ path: './env/.env.keys' });

const app = express();
app.use(express.json());

// Parse CLI args: --<phone_number> and --<appointment_type>
const cliArgs = process.argv.slice(2);
const phoneArg = cliArgs.find(a => /^--\d+$/.test(a))?.replace('--', '');
const typeArg = cliArgs.find(a => /^--(doctor)$/.test(a))?.replace('--', '');

if (cliArgs.length > 0 && (!phoneArg || !typeArg)) {
  console.error('Usage: ts-node server.ts --<phone_number> --<appointment_type>');
  console.error('Example: ts-node server.ts --33600000000 --doctor');
  console.error('Supported appointment types: doctor');
  process.exit(1);
}

const apiKey = process.env.API_KEY || process.env.SMSMODE_API_KEY;
const client = apiKey ? new SmsmodeRcsClient({ apiKey }) : null;
const andre_phone = phoneArg ?? process.env.ANDRE_PHONE!;
const companyName = process.env.COMPANY_NAME || 'notre entreprise';
const companyDestination = process.env.COMPANY_ADDRESS || companyName;

let rdv1: DoctorAppointement | undefined;
let mapAssistant: MapAssistant | undefined;

function ensureConversationHandlers(appointmentType?: string) {
  if (!client) {
    throw new Error('API_KEY manquante: impossible d\'envoyer des messages RCS');
  }

  if (!mapAssistant) {
    mapAssistant = new MapAssistant(true, andre_phone, client, companyName, companyDestination);
  }

  const type = appointmentType ?? typeArg ?? 'doctor';
  if (!rdv1) {
    if (type === 'doctor') {
      rdv1 = new DoctorAppointement(true, andre_phone, client, mapAssistant);
    } else {
      throw new Error(`Type de rendez-vous inconnu: "${type}". Types supportés: doctor`);
    }
  }
}

app.get('/api/slots', async (req, res) => {
  try {
    const slots = await getAllSlots();
    res.json(slots);
  } catch (error) {
    console.error('Erreur lors de la récupération des créneaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/slots/available', async (req, res) => {
  try {
    const slots = await getAvailableSlots();
    res.json(slots);
  } catch (error) {
    console.error('Erreur lors de la récupération des créneaux disponibles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/slots/:slotId', async (req, res) => {
  try {
    const slot = await getSlotById(req.params.slotId);
    if (!slot) {
      res.status(404).json({ error: 'Créneau non trouvé' });
      return;
    }
    res.json(slot);
  } catch (error) {
    console.error('Erreur lors de la récupération du créneau:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/slots/:slotId/book', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Numéro de téléphone requis' });
      return;
    }
    const success = await bookSlot(req.params.slotId, phone);
    if (success) {
      const slot = await getSlotById(req.params.slotId);
      res.json({ message: 'Créneau réservé avec succès', slot });
    } else {
      res.status(409).json({ error: 'Créneau déjà réservé' });
    }
  } catch (error) {
    console.error('Erreur lors de la réservation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/slots/:slotId/calendar', async (req, res) => {
  try {
    const slot = await getSlotById(req.params.slotId);
    if (!slot) {
      res.status(404).json({ error: 'Créneau non trouvé' });
      return;
    }
    const calendarData = generateCalendarFile(slot);
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', `attachment; filename="appointment-${slot.id}.ics"`);
    res.send(calendarData);
  } catch (error) {
    console.error('Erreur lors de la génération du calendrier:', error);
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

app.post('/webhook/rcs', async (req, res) => {
  console.log('Webhook reçu :', JSON.stringify(req.body, null, 2));
  try {
    const payload = parseWebhookPayload(req.body);
    if (isIncomingMessage(payload)) {
      const postbackData = (payload.body as any).postbackData ?? payload.body.text;
      if (rdv1 && await rdv1.waitForScheduleResponse(postbackData)) {
        res.sendStatus(200);
        return;
      }

      if (mapAssistant) {
        await mapAssistant.waitForLocationResponse(payload);
      }
    }
  } catch (e) {
    console.error('Webhook invalide :', e);
  }

  res.sendStatus(200);
});

app.post('/api/ask-appointment', async (req, res) => {
  try {
    ensureConversationHandlers();
    const currentRdv = rdv1;
    if (!currentRdv) {
      throw new Error('Conversation RCS non initialisee');
    }
    await currentRdv.askForAppointment();
    res.json({ message: 'Message de rendez-vous envoyé' });
  } catch (error) {
    console.error('Erreur lors de l\'envoi du message:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
  }
});

async function main() {

  try {
    if (client) {
      ensureConversationHandlers();
      const currentRdv = rdv1;
      if (!currentRdv) {
        throw new Error('Conversation RCS non initialisee');
      }
      await currentRdv.askForAppointment();
    } else {
      console.warn('Aucune API key RCS détectée: le serveur démarre sans envoi de messages RCS.');
    }
  } catch (error) {
    console.error("Erreur lors de l'envoi du message initial:", error);
  }

  app.listen(3000, '0.0.0.0', () => {
    console.log('Serveur lancé sur http://localhost:3000');
    console.log('API disponible sur http://localhost:3000/api');
    console.log('');
    console.log('Endpoints disponibles:');
    console.log('  GET  /api/slots                    - Tous les créneaux');
    console.log('  GET  /api/slots/available         - Créneaux disponibles');
    console.log('  GET  /api/slots/:slotId           - Détails d\'un créneau');
    console.log('  POST /api/slots/:slotId/book      - Réserver un créneau');
    console.log('  GET  /api/slots/:slotId/calendar  - Télécharger le calendrier');
    console.log('  POST /api/ask-appointment         - Envoyer le message RCS initial');
    console.log('  POST /webhook/rcs                 - Webhook RCS');
  });
  const notificationManager = createNotificationManager(client!, "Docteur Dupond", "test");
  notificationManager.startScheduler();
  console.log('Serveur prêt ✅');
}

main().catch((error) => {
  console.error('Erreur au démarrage:', error);
  process.exit(1);
});

// console.log(message.messageId);    // identifiant unique du message
// console.log(message.status.value); // "ENROUTE", "DELIVERED"...
