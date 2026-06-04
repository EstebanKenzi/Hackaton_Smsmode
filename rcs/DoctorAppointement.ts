import { SmsmodeRcsClient } from '@smsmode/rcs';

export class DoctorAppointement
{
    isA2P: boolean;
    phoneNb: string;
    client: SmsmodeRcsClient;
    askForAppointmentMsg: any;

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
    console.log('Message créneau envoyé ✅', this.askForAppointmentMsg);
    }

    async waitForScheduleResponse(postbackData: any)
    {
        if (postbackData?.startsWith('Oui')) {
            const select_calendar = await this.client.send({
            "recipient": {
                "to": this.phoneNb
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
    }
}
