import { SmsmodeRcsClient } from '@smsmode/rcs';
import { getRcsCallbackUrl } from '../config.js';

const getCallbackUrl = (): string => {
    const callbackUrl = getRcsCallbackUrl();
    if (!callbackUrl) {
        throw new Error('RCS_CALLBACK_URL manquante: configurez l’URL publique du webhook ngrok');
    }
    return callbackUrl;
};

type LocationState = 'idle' | 'awaiting_location' | 'route_sent';

type ClientLocation = {
    latitude: number;
    longitude: number;
};

export class MapAssistant {
    isA2P: boolean;
    phoneNb: string;
    client: SmsmodeRcsClient;
    private companyName: string;
    private companyDestination: string;
    private state: LocationState = 'idle';

    constructor(isA2P: boolean, phoneNb: string, client: SmsmodeRcsClient, companyName?: string, companyDestination?: string) {
        this.isA2P = isA2P;
        this.phoneNb = phoneNb;
        this.client = client;
        this.companyName = companyName || 'notre entreprise';
        this.companyDestination = companyDestination || this.companyName;
    }

    async askForLocation() {
        const callbackUrlMo = getCallbackUrl();
        await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo,
            body: {
                type: 'TEXT' as const,
                text: 'Pour vous envoyer le trajet, partagez votre position actuelle.',
                suggestions: [
                    {
                        type: 'REQUEST_LOCATION' as const,
                        text: 'Partager ma position',
                        postbackData: 'request_location'
                    }
                ]
            }
        });

        this.state = 'awaiting_location';
        console.log('Demande de position envoyee ✅');
    }

    async waitForLocationResponse(payload: any) {
        if (this.state !== 'awaiting_location') {
            return false;
        }

        const clientLocation = this.extractClientLocation(payload);

        if (!clientLocation) {
            await this.sendLocationReminder();
            return true;
        }

        await this.sendRouteToCompany(clientLocation);
        this.state = 'route_sent';
        return true;
    }

    private extractClientLocation(payload: any): ClientLocation | null {
        const body = payload?.body ?? {};

        if (typeof body.latitude === 'number' && typeof body.longitude === 'number') {
            return { latitude: body.latitude, longitude: body.longitude };
        }

        if (typeof body.location?.latitude === 'number' && typeof body.location?.longitude === 'number') {
            return {
                latitude: body.location.latitude,
                longitude: body.location.longitude
            };
        }

        if (typeof body.text === 'string') {
            const match = body.text
                .trim()
                .match(/(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)/);

            if (match) {
                return {
                    latitude: Number.parseFloat(match[1].replace(',', '.')),
                    longitude: Number.parseFloat(match[2].replace(',', '.'))
                };
            }
        }

        return null;
    }

    private buildRouteUrl(clientLocation: ClientLocation) {
        const url = new URL('https://www.google.com/maps/dir/');
        url.searchParams.set('api', '1');
        url.searchParams.set('origin', `${clientLocation.latitude},${clientLocation.longitude}`);
        url.searchParams.set('destination', this.companyDestination);
        url.searchParams.set('travelmode', 'driving');
        return url.toString();
    }

    private async sendRouteToCompany(clientLocation: ClientLocation) {
        const routeUrl = this.buildRouteUrl(clientLocation);
        const callbackUrlMo = getCallbackUrl();

        await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo,
            body: {
                type: 'TEXT' as const,
                text: `Votre trajet vers ${this.companyName} est pret. Ouvrez la carte pour demarrer l'itineraire.`,
                suggestions: [
                    {
                        type: 'OPEN_URL' as const,
                        text: 'Ouvrir la carte',
                        postbackData: 'open_route_map',
                        url: routeUrl,
                        webviewSize: 'FULL'
                    }
                ]
            }
        });

        console.log('Itineraire envoye ✅');
    }

    private async sendLocationReminder() {
        const callbackUrlMo = getCallbackUrl();
        await this.client.send({
            recipient: { to: this.phoneNb },
            callbackUrlMo,
            body: {
                type: 'TEXT' as const,
                text: 'Je n\'ai pas encore recu votre position. Pouvez-vous la partager pour generer le trajet ?',
                suggestions: [
                    {
                        type: 'REQUEST_LOCATION' as const,
                        text: 'Partager ma position',
                        postbackData: 'request_location'
                    }
                ]
            }
        });

        console.log('Rappel de position envoye ✅');
    }
}