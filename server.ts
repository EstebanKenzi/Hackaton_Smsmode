import express from 'express';
import dotenv from 'dotenv';
import { SmsmodeRcsClient, parseWebhookPayload, isIncomingMessage } from '@smsmode/rcs';
import { DoctorAppointement } from './rcs/DoctorAppointement.js';
import { getAllSlots, getAvailableSlots, bookSlot, getSlotById } from './slots.js';
import { generateCalendarFile } from './calendar.js';



dotenv.config();

const app = express();
app.use(express.json());


const client = new SmsmodeRcsClient({ apiKey: process.env.API_KEY! });
const andre_phone = process.env.ANDRE_PHONE!;

let rdv1: DoctorAppointement;

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

app.post('/webhook/rcs', async (req, res) => {
  console.log('Webhook reçu :', JSON.stringify(req.body, null, 2));
  try {
    const payload = parseWebhookPayload(req.body);
    if (isIncomingMessage(payload)) {
      const postbackData = (payload.body as any).postbackData ?? payload.body.text;
      if (rdv1) {
        await rdv1.waitForScheduleResponse(postbackData);
      }
    }
  } catch (e) {
    console.error('Webhook invalide :', e);
  }

  res.sendStatus(200);
});

app.post('/api/ask-appointment', async (req, res) => {
  try {
    if (!rdv1) {
      rdv1 = new DoctorAppointement(true, andre_phone, client);
    }
    await rdv1.askForAppointment();
    res.json({ message: 'Message de rendez-vous envoyé' });
  } catch (error) {
    console.error('Erreur lors de l\'envoi du message:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
  }
});

async function main() {

  rdv1 = new DoctorAppointement(true, andre_phone, client);
  try {
    await rdv1.askForAppointment();
  } catch (error) {
    console.error("Erreur lors de l'envoi du message initial:", error);
  }

  app.listen(3000, () => {
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
  console.log('Message créneau envoyé ✅');
}

main().catch((error) => {
  console.error('Erreur au démarrage:', error);
  process.exit(1);
});

// console.log(message.messageId);    // identifiant unique du message
// console.log(message.status.value); // "ENROUTE", "DELIVERED"...
