import { getAvailableSlots, bookSlot, getSlotById, cancelSlot, updateSlot } from '../slots.js';
export class DoctorAppointement {
    constructor(isA2P, phone_nb, client, locationAssistant) {
        this.state = 'idle';
        this.isA2P = isA2P;
        this.phoneNb = phone_nb;
        this.client = client;
        this.locationAssistant = locationAssistant;
    }
    ;
    async askForAppointment() {
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
        const suggestions = slots.map((slot) => ({
            type: "REPLY",
            text: slot.label,
            postbackData: slot.id
        }));
        await this.client.send({
            "recipient": { "to": this.phoneNb },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            "body": {
                "type": "TEXT",
                "text": "Quel créneau vous convient le mieux ?",
                "suggestions": suggestions
            }
        });
        this.state = 'awaiting_schedule';
        console.log('Créneaux envoyés ✅');
    }
    async waitForScheduleResponse(postbackData) {
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
        }
        else if (this.state === 'awaiting_confirmation' && postbackData === 'non') {
            await this.sendGoodbye();
            this.state = 'idle';
            return true;
        }
        else if (this.state === 'awaiting_confirmation' && postbackData === 'plus tard') {
            await this.sendReminder();
            this.state = 'idle';
            return true;
        }
        else if (this.state === 'awaiting_schedule') {
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
                "type": "TEXT",
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
                "type": "TEXT",
                "text": "Pas de souci, on vous recontacte bientôt ! 😊"
            }
        });
        console.log('Message rappel envoyé ✅');
    }
    async sendCalendar(slotId) {
        const slot = await getSlotById(slotId);
        if (!slot) {
            console.error('Slot non trouvé');
            return;
        }
        await this.client.send({
            "recipient": { "to": this.phoneNb },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            "body": {
                "type": "TEXT",
                "text": "Merci ! Votre RDV est confirmé. Ajoutez-le à votre calendrier :",
                "suggestions": [
                    {
                        "type": "CREATE_CALENDAR_EVENT",
                        "text": "Ajouter au calendrier",
                        "postbackData": "calendar_event_confirmed",
                        "title": "RDV Dr Dubois",
                        "description": "Consultation médicale",
                        "startTime": slot.isoStart,
                        "endTime": slot.isoEnd
                    },
                    {
                        "type": "REPLY",
                        "text": "Choisir un autre créneau",
                        "postbackData": "reschedule_appointment"
                    },
                    {
                        "type": "REPLY",
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
    async sendConfirmationMessage(slotId) {
        const slot = await getSlotById(slotId);
        if (!slot) {
            console.error('Slot non trouvé pour confirmation');
            return;
        }
        await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            body: {
                type: 'TEXT',
                text: `✅ Merci pour votre confirmation! Votre rendez-vous du ${slot.label} est bien confirmé. À bientôt!`,
            }
        });
        console.log(`✅ Message de confirmation envoyé pour le créneau ${slotId}`);
    }
    async sendCancellationMessage(slotId) {
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
                type: 'TEXT',
                text: `❌ Votre rendez-vous du ${slot.label} a été annulé. N'hésitez pas à nous recontacter pour en prendre un autre!`,
            }
        });
        console.log(`❌ Rendez-vous ${slotId} annulé`);
    }
    async sendModificationMessage(slotId) {
        const availableSlots = await getAvailableSlots();
        const currentSlot = await getSlotById(slotId);
        if (!currentSlot) {
            console.error('Slot non trouvé pour modification');
            return;
        }
        // Cancel the current booking
        await cancelSlot(slotId);
        // Prepare suggestions for available slots
        const suggestions = availableSlots.map((slot) => ({
            type: "REPLY",
            text: slot.label,
            postbackData: slot.id
        }));
        await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo: 'https://smsmode-hack-team-1.ngrok.dev/webhook/rcs',
            body: {
                type: 'TEXT',
                text: `🔄 Votre rendez-vous du ${currentSlot.label} a été annulé. Quel autre créneau vous convient?`,
                suggestions: suggestions
            }
        });
        this.state = 'awaiting_schedule';
        console.log(`🔄 Demande de modification envoyée pour le créneau ${slotId}`);
    }
}
