import * as wppconnect from '@wppconnect-team/wppconnect';
import { BotController } from '../controllers/BotController';

export class WhatsAppClient {
    private client: wppconnect.Whatsapp | null = null;
    private controlador: BotController; 

    // Cuando creamos el WhatsAppClient, le pasamos el Cerebro
    constructor(controlador: BotController) {
        this.controlador = controlador;
    }

    // Iniciamos la conexión con wppconnect
    public async iniciar(): Promise<void> {
        try {
            console.log('📱 Iniciando cliente de WhatsApp...');
            
            this.client = await wppconnect.create({
                session: 'cooperativa-session', // Nombre de la sesión para que guarde el login
                catchQR: (base64Qr, asciiQR) => {
                    console.log('Terminal: Escaneá este código QR para iniciar sesión:');
                    console.log(asciiQR); // Muestra el QR en la terminal
                },
                statusFind: (statusSession, session) => {
                    console.log(`Estado de sesión de WhatsApp: ${statusSession}`);
                },
                headless: true, 
                puppeteerOptions: {
                    userDataDir: './tokens/cooperativa-session', 
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu' 
                    ]
                }
            });
            
            console.log('✅ WhatsApp conectado y listo para recibir mensajes.');
            this.escucharMensajes();

        } catch (error) {
            console.error('❌ Error crítico al iniciar WhatsApp:', error);
            throw error;
        }
    }

    // Método privado que se queda escuchando todo el tiempo
    private escucharMensajes(): void {
        if (!this.client) return;

        this.client.onMessage((message) => {
            
            // 1. Ignorar mensajes de Grupos
            if (message.isGroupMsg) return;

            // 2. Ignorar Estados / Historias
            if (message.from === 'status@broadcast') return;

            // 3. Ignorar mensajes de sistema (cambios de foto, seguridad, etc)
            if (message.type === 'e2e_notification' || message.type === 'protocol' || message.type === 'revoked') return;

            // 4. Ignorar llamadas perdidas
            if (message.type === 'call_log') return;

            console.log(`📩 Mensaje recibido de ${message.from}: ${message.body}`);

            // Le pasamos el mensaje al Cerebro y le enseñamos CÓMO responder
            this.controlador.procesarMensaje(message.from, message.body!, async (textoRespuesta: string) => {
                await this.client!.sendText(message.from, textoRespuesta);
            });
            
            // TODO: Acá más adelante vamos a conectar el controlador de los menús
        });
    }
}