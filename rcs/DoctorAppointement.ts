import { SmsmodeRcsClient } from '@smsmode/rcs';
import { getAvailableSlots, bookSlot, getSlotById, Slot, cancelSlot, updateSlot } from '../slots.js';
import { MapAssistant } from './map.js';
import { sendSMS } from './sms.js';

type AppointmentState = 'idle' | 'awaiting_confirmation' | 'awaiting_schedule' | 'completed';

export class DoctorAppointement
{
    isA2P: boolean;
    phoneNb: string;
    client: SmsmodeRcsClient;
    askForAppointmentMsg: any;
    private state: AppointmentState = 'idle';
    private locationAssistant?: MapAssistant;

    constructor(isA2P: boolean, phone_nb: string, client: SmsmodeRcsClient, locationAssistant?: MapAssistant)
    {
        this.isA2P = isA2P;
        this.phoneNb = phone_nb;
        this.client = client;
        this.locationAssistant = locationAssistant;
    };

    async askForAppointment()
    {
        this.askForAppointmentMsg = await this.client.send({
            "recipient": {
            "to": this.phoneNb
            },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            "body": {
            "type": "TEXT",
            "text": "Bonjour, souhaitez vous prendre un rendez-vous ?",
            "suggestions": [
                {
                "type": "REPLY",
                "text": "Oui",
                "postbackData": "oui"
                },
                {
                "type": "REPLY",
                "text": "Plus tard",
                "postbackData": "plus tard"
                },
                {
                "type": "REPLY",
                "text": "Pas intéressé",
                "postbackData": "non"
                },
            ]
            }
        });
        this.state = 'awaiting_confirmation';
        console.log('Message créneau envoyé ✅', this.askForAppointmentMsg);

        setTimeout(async () => {
        const messageId = this.askForAppointmentMsg?.messageId;
        
        
        const response = await fetch(`https://rest.smsmode.com/rcs/v1/messages/${messageId}`, {
            headers: {
                'X-Api-Key': process.env.API_KEY!,
                'Accept': 'application/json'
            }
        });
        const data = await response.json();
        
        
        if (data.status?.value !== 'DELIVERED') {
            console.log('RCS non délivré → fallback SMS');
            await sendSMS(
                this.phoneNb,
                'Bonjour, souhaitez-vous prendre un RDV ? Répondez OUI ou NON.',
                process.env.API_KEY!
            );
            }
        }, 30000);
        
    }

    async askForSchedule() {
    const slots = await getAvailableSlots();

    const suggestions: Array<{ type: "REPLY"; text: string; postbackData: string }> = slots.map((slot: Slot) => ({
        type: "REPLY" as const,
        text: slot.label,
        postbackData: slot.id
    }));

    
    await this.client.send({
        "recipient": { "to": this.phoneNb },
        callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
        "body": {
        "type": "TEXT" as const,
        "text": "Quel créneau vous convient le mieux ?",
        "suggestions": suggestions
        }
    });

    this.state = 'awaiting_schedule';
    console.log('Créneaux envoyés ✅');
    }

    async waitForScheduleResponse(postbackData: any) {
    if (postbackData?.startsWith('appointment_confirmed_')) {
      const slotId = postbackData.replace('appointment_confirmed_', '');
      await this.sendConfirmationMessage(slotId);
      return true;
    }

    if (postbackData?.startsWith('appointment_cancel_')) {
      const slotId = postbackData.replace('appointment_cancel_', '');
      await this.sendCancellationMessage(slotId);
      return true;
    }

    if (postbackData?.startsWith('appointment_modify_')) {
      const slotId = postbackData.replace('appointment_modify_', '');
      await this.sendModificationMessage(slotId);
      return true;
    }

    if (this.state === 'awaiting_confirmation' && postbackData === 'oui') {
        await this.askForSchedule();
        return true;

    } else if (this.state === 'awaiting_confirmation' && postbackData === 'non') {
        await this.sendGoodbye();
        this.state = 'idle';
        return true;

    } else if (this.state === 'awaiting_confirmation' && postbackData === 'plus tard') {
        await this.sendReminder();
        this.state = 'idle';
        return true;

    } else if (this.state === 'awaiting_schedule') {
       
        await bookSlot(postbackData, this.phoneNb);
        await updateSlot(postbackData, { bookingTime: Date.now(), notificationSent: false });
        await this.sendCalendar(postbackData);
        this.state = 'completed';
        return true;
    }

    return false;
    }

    async sendGoodbye() {
    await this.client.send({
        "recipient": { "to": this.phoneNb },
        callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
        "body": {
        "type": "TEXT" as const,
        "text": "D'accord, n'hésitez pas à nous recontacter si vous changez d'avis ! 😊"
        }
    });
    console.log('Message au revoir envoyé ✅');
    }

    async sendReminder() {
    await this.client.send({
        "recipient": { "to": this.phoneNb },
        callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
        "body": {
        "type": "TEXT" as const,
        "text": "Pas de souci, on vous recontacte bientôt ! 😊"
        }
    });
    console.log('Message rappel envoyé ✅');
    }

    async sendCalendar(slotId: string) {
    const slot = await getSlotById(slotId);
  
    if (!slot) {
    console.error('Slot non trouvé');
    return;
    }

    await this.client.send({
    "recipient": { "to": this.phoneNb },
    callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
    "body": {
      "type": "TEXT" as const,
      "text": "Merci ! Votre RDV est confirmé. Ajoutez-le à votre calendrier :",
      "suggestions": [
        {
          "type": "CREATE_CALENDAR_EVENT" as const,
          "text": "Ajouter au calendrier",
          "postbackData": "calendar_event_confirmed",
          "title": "RDV Dr Dubois",
          "description": "Consultation médicale",
          "startTime": slot.isoStart,
          "endTime": slot.isoEnd
        },
        {
          "type": "REPLY" as const,
          "text": "Choisir un autre créneau",
          "postbackData": "reschedule_appointment"
        },
        {
          "type": "REPLY" as const,
          "text": "Annuler le RDV",
          "postbackData": "cancel_appointment"
        },
      ]
    }
  });
  console.log('Message calendrier envoyé ✅');

    if (this.locationAssistant) {
        await this.locationAssistant.askForLocation();
    }
}

async sendConfirmationMessage(slotId: string) {
  const slot = await getSlotById(slotId);
  if (!slot) {
    console.error('Slot non trouvé pour confirmation');
    return;
  }

  await this.client.send({
    recipient: { to: this.phoneNb },
    callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
    body: {
      type: 'TEXT' as const,
      text: `✅ Merci pour votre confirmation! Votre rendez-vous du ${slot.label} est bien confirmé. À bientôt!`,
    }
  });

  console.log(`✅ Message de confirmation envoyé pour le créneau ${slotId}`);
}

async sendCancellationMessage(slotId: string) {
  const slot = await getSlotById(slotId);
  if (!slot) {
    console.error('Slot non trouvé pour annulation');
    return;
  }

  await cancelSlot(slotId);
  
  await this.client.send({
    recipient: { to: this.phoneNb },
    callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
    body: {
      type: 'TEXT' as const,
      text: `❌ Votre rendez-vous du ${slot.label} a été annulé. N'hésitez pas à nous recontacter pour en prendre un autre!`,
    }
  });

  console.log(`❌ Rendez-vous ${slotId} annulé`);
}

async sendModificationMessage(slotId: string) {
  const availableSlots = await getAvailableSlots();
  const currentSlot = await getSlotById(slotId);

  if (!currentSlot) {
    console.error('Slot non trouvé pour modification');
    return;
  }

  // Cancel the current booking
  await cancelSlot(slotId);

  // Prepare suggestions for available slots
  const suggestions: Array<{ type: "REPLY"; text: string; postbackData: string }> = availableSlots.map((slot: Slot) => ({
    type: "REPLY" as const,
    text: slot.label,
    postbackData: slot.id
  }));

  await this.client.send({
    recipient: { to: this.phoneNb },
    callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
    body: {
      type: 'TEXT' as const,
      text: `🔄 Votre rendez-vous du ${currentSlot.label} a été annulé. Quel autre créneau vous convient?`,
      suggestions: suggestions
    }
  });

  this.state = 'awaiting_schedule';
  console.log(`🔄 Demande de modification envoyée pour le créneau ${slotId}`);
}
}
