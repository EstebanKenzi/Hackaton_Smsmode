import express from 'express';
import dotenv from 'dotenv';
import { SmsmodeRcsClient } from '@smsmode/rcs';
import { readFileSync } from 'fs';

dotenv.config({ path: './env/config.env' });

const slots = JSON.parse(readFileSync('./slots.json', 'utf-8'));

const app = express();
app.use(express.json());

const suggestions = slots.map((slot: any) => ({
  "type": "REPLY",
  "text": `${slot.date} à ${slot.heure}`,
  "postbackData": slot.postbackData
}));

const client = new SmsmodeRcsClient({ apiKey: process.env.API_KEY! });
const andre_phone = process.env.ANDRE_PHONE!;

app.post('/webhook/rcs', async (req, res) => {
  console.log('Webhook reçu :', JSON.stringify(req.body, null, 2));

  const postbackData = req.body?.postbackData;

  if (postbackData?.startsWith('resched_')) {
    const dateStr = postbackData.replace('resched_', '');
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(9, 11);
    const min = dateStr.substring(11, 13);

    const startTime = `${year}-${month}-${day}T${hour}:${min}:00`;
    const endTime = `${year}-${month}-${day}T${parseInt(hour) + 1}:${min}:00`;

    await client.send({
      "recipient": { "to": andre_phone },
      callbackUrlMo: 'https://cupping-laboring-grumpily.ngrok-free.dev/webhook/rcs',
      "body": {
        "type": "TEXT",
        "text": "Merci pour votre choix. Ajoutez l'événement à votre calendrier :",
        "suggestions": [
          {
            "type": "CREATE_CALENDAR_EVENT",
            "text": "Ajouter au calendrier",
            "postbackData": "calendar_event_123",
            "title": "RDV Dr Dubois",
            "description": "Consultation médicale",
            "startTime": startTime,
            "endTime": endTime
          }
        ]
      }
    });
    console.log('Message calendrier envoyé ✅');
  }

  res.sendStatus(200);
});

async function main() {
  await client.send({
    "recipient": { "to": andre_phone },
    callbackUrlMo: 'https://cupping-laboring-grumpily.ngrok-free.dev/webhook/rcs',
    "body": {
      "type": "TEXT",
      "text": "Quel créneau vous convient le mieux ?",
      "suggestions": suggestions
    }
  });
  console.log('Message créneau envoyé ✅');
}

main();

app.listen(3000, '0.0.0.0', () => {
  console.log('Serveur lancé sur http://localhost:3000');
});

// console.log(message.messageId);    // identifiant unique du message
// console.log(message.status.value); // "ENROUTE", "DELIVERED"...
