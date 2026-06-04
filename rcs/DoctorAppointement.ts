import { SmsmodeRcsClient } from '@smsmode/rcs';
import { getAvailableSlots, getAllSlots, bookSlot, Slot } from '../slots.js';

type State = 'idle' | 'awaiting_confirmation' | 'awaiting_slot' | 'booked';

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

    async waitForScheduleResponse(postbackData: string)
    {
        if (this.state === 'awaiting_confirmation') {
            const normalized = postbackData?.toLowerCase().trim();
            if (normalized === 'oui') {
                await this.sendSlotSelection();
            }
            return;
        }

        if (this.state === 'awaiting_slot') {
            await this.handleSlotSelection(postbackData);
        }
    }

    private async sendSlotSelection()
    {
        const slots = await getAvailableSlots();

        if (slots.length === 0) {
            await this.client.send({
                recipient: { to: this.phoneNb },
                callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
                body: {
                    type: 'TEXT',
                    text: 'Désolé, aucun créneau n\'est disponible pour le moment. Nous vous recontacterons bientôt.',
                }
            });
            this.state = 'idle';
            return;
        }

        const suggestions = slots.map((slot: Slot) => ({
            type: 'REPLY' as const,
            text: slot.label,
            postbackData: slot.id,
        }));

        await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            body: {
                type: 'TEXT',
                text: 'Voici les créneaux disponibles. Choisissez celui qui vous convient :',
                suggestions,
            }
        });

        this.state = 'awaiting_slot';
        console.log('Créneaux envoyés ✅');
    }

    private async handleSlotSelection(slotId: string)
    {
        const booked = await bookSlot(slotId, this.phoneNb);

        if (!booked) {
            await this.sendSlotSelection();
            return;
        }

        const allSlots = await getAllSlots();
        const slot = allSlots.find((s: Slot) => s.id === slotId)!;

        await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            body: {
                type: 'TEXT',
                text: `Votre rendez-vous "${slot.label}" est confirmé ! Ajoutez-le à votre calendrier :`,
                suggestions: [
                    {
                        type: 'CREATE_CALENDAR_EVENT',
                        text: 'Ajouter au calendrier',
                        postbackData: `calendar_${slotId}`,
                        title: 'RDV Dr Dubois',
                        description: 'Consultation médicale',
                        startTime: slot.isoStart,
                        endTime: slot.isoEnd,
                    }
                ]
            }
        });

        this.state = 'booked';
        console.log(`Rendez-vous ${slotId} confirmé pour ${this.phoneNb} ✅`);
    }
}
