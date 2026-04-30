import * as wppconnect from '@wppconnect-team/wppconnect';
import { BotController, PasoBot } from '../controllers/BotController';

export class WhatsAppClient {
    private client: wppconnect.Whatsapp | null = null;
    private controlador: BotController; 

    private chatsSilenciados: Map<string, NodeJS.Timeout>;

    // Cuando creamos el WhatsAppClient, le pasamos el Cerebro
    constructor(controlador: BotController) {
        this.controlador = controlador;
        this.chatsSilenciados = new Map();
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

    // Método para silenciar el bot en un chat específico
    private activarModoHumano(telefono: string): void {
        // Si ya estaba silenciado, cancelamos el reloj viejo
        if (this.chatsSilenciados.has(telefono)) {
            clearTimeout(this.chatsSilenciados.get(telefono)!);
        }

        // Lo silenciamos por 30 minutos (1800000 milisegundos)
        console.log(`👤 MODO HUMANO: Bot silenciado por 30 min. en el chat ${telefono}`);
        const relojModoHumano = setTimeout(() => {
            this.chatsSilenciados.delete(telefono);
            console.log(`🤖 MODO BOT reactivado en el chat ${telefono}`);
        }, 1800000); 

        this.chatsSilenciados.set(telefono, relojModoHumano);
    }

    // Método para gestionar las etiquetas de WhatsApp
    public async asignarEtiqueta(telefono: string, nombreEtiqueta: string): Promise<void> {
        if (!this.client) return;

        try {
            // Traemos todas las etiquetas
            let etiquetas = await this.client.getAllLabels();
            
            // Buscamos si ya existe
            let etiquetaExistente = etiquetas.find(e => e.name.toUpperCase() === nombreEtiqueta.toUpperCase());
            
            let idEtiquetaFinal: string | undefined;

            if (etiquetaExistente && etiquetaExistente.id) {
                // Si existe, guardamos su ID
                idEtiquetaFinal = etiquetaExistente.id;
            } else {
                // Si no existe, la creamos.
                console.log(`🏷️ Creando nueva etiqueta en WhatsApp: ${nombreEtiqueta}`);
                await this.client.addNewLabel(nombreEtiqueta); 
                
                // Volvemos a pedir la lista de etiquetas actualizada para obtener el ID de la nueva
                etiquetas = await this.client.getAllLabels();
                etiquetaExistente = etiquetas.find(e => e.name.toUpperCase() === nombreEtiqueta.toUpperCase());
                
                if (etiquetaExistente && etiquetaExistente.id) {
                    idEtiquetaFinal = etiquetaExistente.id;
                }
            }
            
            // Asignamos la etiqueta
            if (idEtiquetaFinal) {
                await this.client.addOrRemoveLabels(telefono, [{ labelId: idEtiquetaFinal, type: 'add' }]);
                console.log(`✅ Etiqueta '${nombreEtiqueta}' agregada a ${telefono}`);
            } else {
                console.warn(`⚠️ No se pudo obtener un ID válido para la etiqueta '${nombreEtiqueta}'`);
            }
        } catch (error) {
            console.error(`❌ Error al gestionar la etiqueta '${nombreEtiqueta}':`, error);
        }
    }

    // Método privado que se queda escuchando todo el tiempo
    private escucharMensajes(): void {
        if (!this.client) return;

        this.client.onAnyMessage((message) => {

            // Identificamos el número de chat (ya sea que me escriban, o que escriba yo)
            const telefono = message.fromMe ? message.to : message.from;
            
            // Ignorar mensajes de Grupos
            if (message.isGroupMsg) return;
            // Ignorar Estados / Historias
            if (message.from === 'status@broadcast') return;
            // Ignorar mensajes de sistema (cambios de foto, seguridad, etc)
            if (message.type === 'e2e_notification' || message.type === 'protocol' || message.type === 'revoked') return;
            // Ignorar llamadas perdidas
            if (message.type === 'call_log') return;

            // 1. Extraemos el texto de forma SEGURA.
            // Si es un string normal, lo tomamos. Si es un archivo/sticker/audio, por ahora lo dejamos vacío.
            let textoRecibido = typeof message.body === 'string' ? message.body.trim() : "";

            // Lógica de Modo Humano (Interceptamos los mensajes de salida)
            if (message.fromMe) {
                // El truco de Legacy: Si el texto tiene el carácter invisible (\u200D), fue el bot. Lo ignoramos.
                if (textoRecibido.includes('\u200D')) {
                    return; 
                }

                // Si no tiene el carácter invisible y escribiste algo o mandaste algo, activamos Modo Humano
                this.activarModoHumano(telefono);
                this.controlador.forzarCierreSesion(telefono); 
                return;
            }

            // Si el chat está en "Modo Humano", ignoramos lo que nos respondan
            if (this.chatsSilenciados.has(telefono)) {
                return;
            }

            // Si el mensaje es de un bot, de sistema, o si nos mandaron puro archivo sin texto, ignoramos para que no explote.
            if (!textoRecibido || textoRecibido === "") {
                return; 
            }

            console.log(`📩 Mensaje recibido de ${message.from}: ${message.body}`);

            // Le pasamos el mensaje al Cerebro y le enseñamos CÓMO responder
            this.controlador.procesarMensaje(
                telefono, 
                textoRecibido, 
                async (textoRespuesta: string) => {
                    await this.client!.sendText(telefono, textoRespuesta + '\u200D');
                },
                async (nombreEtiqueta: string) => {
                    await this.asignarEtiqueta(telefono, nombreEtiqueta);
                }
            );            
        });
    }
}