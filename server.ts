import express from 'express';
import dotenv from 'dotenv';
import { SmsmodeRcsClient } from '@smsmode/rcs';

dotenv.config({ path: './env/config.env' });

const app = express();
app.use(express.json());

const client = new SmsmodeRcsClient({ apiKey: process.env.API_KEY! });
const andre_phone = process.env.ANDRE_PHONE!;

app.post('/webhook/rcs', async (req, res) => {
  console.log('Webhook reçu :', JSON.stringify(req.body, null, 2));

  const postbackData = req.body?.postbackData;

  if (postbackData?.startsWith('resched_')) {
    const select_calendar = await client.send({
      "recipient": {
        "to": andre_phone
      },
      callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
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
            "startTime": "2026-10-18T14:30:00",
            "endTime": "2026-10-18T15:00:00"
          }
        ]
      }
    });
    console.log('Message calendrier envoyé ✅', select_calendar);
  }

  res.sendStatus(200);
});

async function main() {
  const select_appointement_time = await client.send({
    "recipient": {
      "to": andre_phone
    },
    callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
    "body": {
      "type": "TEXT",
      "text": "Quel créneau vous convient le mieux ?",
      "suggestions": [
        {
          "type": "REPLY",
          "text": "15/10 à 08:30",
          "postbackData": "resched_20261015T0830"
        },
        {
          "type": "REPLY",
          "text": "15/10 à 11:30",
          "postbackData": "resched_20261015T1130"
        },
        {
          "type": "REPLY",
          "text": "16/10 à 09:00",
          "postbackData": "resched_20261016T0900"
        },
        {
          "type": "REPLY",
          "text": "18/10 à 14:30",
          "postbackData": "resched_20261018T1430"
        }
      ]
    }
  });
  console.log('Message créneau envoyé ✅', select_appointement_time);
}

main();

app.listen(3000, () => {
  console.log('Serveur lancé sur http://localhost:3000');
});

// console.log(message.messageId);    // identifiant unique du message
// console.log(message.status.value); // "ENROUTE", "DELIVERED"...
