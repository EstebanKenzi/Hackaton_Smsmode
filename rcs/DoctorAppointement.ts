import { SmsmodeRcsClient } from '@smsmode/rcs';
import { getAvailableSlots, bookSlot, getSlotById, Slot } from '../slots.js';

export class DoctorAppointement
{
    isA2P: boolean;
    phoneNb: string;
    client: SmsmodeRcsClient;
    askForAppointmentMsg: any;
    private state: State = 'idle';

    constructor(isA2P: boolean, phone_nb: string, client: SmsmodeRcsClient)
    {
        this.isA2P = isA2P;
        this.phoneNb = phone_nb;
        this.client = client;
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

    console.log('Créneaux envoyés ✅');
    }

    async waitForScheduleResponse(postbackData: any) {
    if (postbackData === 'oui') {
        await this.askForSchedule();

    } else if (postbackData === 'non') {
        await this.sendGoodbye();

    } else if (postbackData === 'plus tard') {
        await this.sendReminder();

    } else {
       
        await bookSlot(postbackData, this.phoneNb);
        await this.sendCalendar(postbackData);
    }
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
        }
      ]
    }
  });
  console.log('Message calendrier envoyé ✅');
}
}
