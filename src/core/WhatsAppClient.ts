import * as wppconnect from '@wppconnect-team/wppconnect';
import { BotController, PasoBot } from '../controllers/BotController';

export class WhatsAppClient {
    private client: wppconnect.Whatsapp | null = null;
    private controlador: BotController; 

    private chatsSilenciados: Map<string, NodeJS.Timeout>;

    // Cuando crea el WhatsappClient, se pasa el cerebro.
    constructor(controlador: BotController) {
        this.controlador = controlador;
        this.chatsSilenciados = new Map();
    }

    // Inicia la conexion con wppconnect.
    public async iniciar(): Promise<void> {
        try {
            console.log('📱 Iniciando cliente de WhatsApp...');
            
            this.client = await wppconnect.create({
                session: 'cooperativa-session', // Nombre de la sesion
                catchQR: (base64Qr, asciiQR) => {
                    console.log('Terminal: Escaneá este código QR para iniciar sesión:');
                    console.log(asciiQR);
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
            
            console.log('WhatsApp conectado y listo para recibir mensajes.');
            this.escucharMensajes();

        } catch (error) {
            console.error('Error critico al iniciar WhatsApp:', error);
            throw error;
        }
    }

    // Metodo para silenciar el bot en un chat especifico.
    private activarModoHumano(telefono: string): void {
        // Si ya estaba silenciado, se reinicia.
        if (this.chatsSilenciados.has(telefono)) {
            clearTimeout(this.chatsSilenciados.get(telefono)!);
        }

        // Lo silencia por 30 minutos (1800000 milisegundos).
        console.log(`👤 MODO HUMANO: Bot silenciado por 30 min. en el chat ${telefono}`);
        const relojModoHumano = setTimeout(() => {
            this.chatsSilenciados.delete(telefono);
            console.log(`🤖 MODO BOT reactivado en el chat ${telefono}`);
        }, 1800000); 

        this.chatsSilenciados.set(telefono, relojModoHumano);
    }

    // Metodo para gestionar las etiquetas de WhatsApp.
    public async asignarEtiqueta(telefono: string, nombreEtiqueta: string): Promise<void> {
        if (!this.client) return;

        try {
            // Trae todas las etiquetas.
            let etiquetas = await this.client.getAllLabels();
            
            // Busca si ya existe.
            let etiquetaExistente = etiquetas.find(e => e.name.toUpperCase() === nombreEtiqueta.toUpperCase());
            
            let idEtiquetaFinal: string | undefined;

            if (etiquetaExistente && etiquetaExistente.id) {
                // Si existe, guarda su ID.
                idEtiquetaFinal = etiquetaExistente.id;
            } else {
                // Si no existe, la crea.
                console.log(`🏷️ Creando nueva etiqueta en WhatsApp: ${nombreEtiqueta}`);
                await this.client.addNewLabel(nombreEtiqueta); 
                
                // Vuelve a pedir la lista de etiquetas actualizada para obtener el ID de la nueva.
                etiquetas = await this.client.getAllLabels();
                etiquetaExistente = etiquetas.find(e => e.name.toUpperCase() === nombreEtiqueta.toUpperCase());
                
                if (etiquetaExistente && etiquetaExistente.id) {
                    idEtiquetaFinal = etiquetaExistente.id;
                }
            }
            
            // Asigna la etiqueta.
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

    // Metodo privado que se quede escuchando.
    private escucharMensajes(): void {
        if (!this.client) return;

        this.client.onAnyMessage((message) => {

            // Identifica el numero de chat.
            const telefono = message.fromMe ? message.to : message.from;
            
            // Ignora mensajes de Grupos.
            if (message.isGroupMsg) return;
            // Ignora Estados.
            if (message.from === 'status@broadcast') return;
            // Ignora mensajes de sistema (cambios de foto, seguridad, etc).
            if (message.type === 'e2e_notification' || message.type === 'protocol' || message.type === 'revoked') return;
            // Ignora llamadas perdidas.
            if (message.type === 'call_log') return;
            // Ignora Canales de Whatsapp.
            if (telefono.includes('@newsletter')) return;

            // Si es un string normal, lo toma. Si es un archivo/sticker/audio, por ahora lo deja vacio.
            let textoRecibido = typeof message.body === 'string' ? message.body.trim() : "";

            // Logica de Modo Humano (Interceptamos los mensajes de salida)
            if (message.fromMe) {
                // Si el texto tiene el caracter invisible (\u200D), lo ignora.
                if (textoRecibido.includes('\u200D')) {
                    return; 
                }

                // Si no tiene el caracter invisible, activa modo humano.
                this.activarModoHumano(telefono);
                this.controlador.forzarCierreSesion(telefono); 
                return;
            }

            // Si el chat esta en modo humano, ignora los que respondan.
            if (this.chatsSilenciados.has(telefono)) {
                return;
            }

            // Si el mensaje es de un bot, de sistema, o si nos mandaron puro archivo sin texto, ignora.
            if (!textoRecibido || textoRecibido === "") {
                return; 
            }

            console.log(`📩 Mensaje recibido de ${message.from}: ${message.body}`);

            // Le pasa el mensaje al cerebro.
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