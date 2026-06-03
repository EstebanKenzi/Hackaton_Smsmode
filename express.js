import express from 'express';
import {
  parseWebhookPayload,
  isDeliveryReport,
  isIncomingMessage,
} from '@smsmode/rcs';

const app = express();
app.use(express.json());

app.post('/webhook/rcs', (req, res) => {
  try {
    const payload = parseWebhookPayload(req.body);

    if (isDeliveryReport(payload)) {
      // Rapport de livraison (DLR) : direction: 'MT'
      // payload.status.value : "ENROUTE", "DELIVERED", "READ", "UNDELIVERABLE"...
      console.log(`Message ${payload.messageId} : statut : ${payload.status.value}`);

    } else if (isIncomingMessage(payload)) {
      // Message entrant (MO) : direction: 'MO'
      // payload.body est toujours de type RcsTextBody
      console.log(`Réponse de ${payload.recipient.to} : ${payload.body.text}`);

      // originMessageId identifie le message MT auquel ce MO répond
      console.log(`En réponse au message : ${payload.originMessageId}`);
    }

    // Toujours répondre avec un statut 2xx pour acquitter la notification
    // Sans cela, smsmode considérera la notification comme échouée et retentera
    res.sendStatus(200);

  } catch {
    // parseWebhookPayload lève une ValidationError si le payload est invalide
    res.sendStatus(400);
  }
});

app.listen(3000, () => console.log('Webhook server listening on port 3000'));