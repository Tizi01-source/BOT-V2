import { DatabaseManager } from '../services/Database';

// Definimos los pasos fijos de nuestro bot
export enum PasoBot {
    INICIO = 'INICIO',
    MENU_PRINCIPAL = 'MENU_PRINCIPAL',
    ESPERANDO_DNI = 'ESPERANDO_DNI',
    HABLANDO_CON_HUMANO = 'HABLANDO_CON_HUMANO'
}

export class BotController {
    private sesionesActivas: Map<string, PasoBot>;
    private db: DatabaseManager;

    // Recibimos la base de datos lista para usar cuando creamos el controlador
    constructor(db: DatabaseManager) {
        this.sesionesActivas = new Map();
        this.db = db;
    }

    public async procesarMensaje(numero: string, texto: string, enviarMensaje: (texto: string) => Promise<void>): Promise<void> {
        
        // El usuario puede forzar un reinicio en cualquier momento escribiendo "hola" o "volver"
        if (texto.toLowerCase() === 'hola' || texto.toLowerCase() === 'volver') {
            this.sesionesActivas.set(numero, PasoBot.INICIO);
        }

        const pasoActual = this.sesionesActivas.get(numero) || PasoBot.INICIO;
        console.log(`🧠 Procesando a ${numero} en el paso: ${pasoActual}`);

        switch (pasoActual) {
            case PasoBot.INICIO:
                await this.manejadorInicio(numero, texto, enviarMensaje);
                break;
            case PasoBot.MENU_PRINCIPAL:
                await this.manejadorMenuPrincipal(numero, texto, enviarMensaje);
                break;
            case PasoBot.ESPERANDO_DNI:
                await this.manejadorEsperandoDni(numero, texto, enviarMensaje);
                break;
            default:
                this.sesionesActivas.delete(numero);
                await enviarMensaje("Ocurrió un error. Volvamos a empezar. Escribí 'Hola'.");
                break;
        }
    }

    // ==========================================
    // 🛠️ LA LÓGICA DE CADA PASO
    // ==========================================

    private async manejadorInicio(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const saludo = "¡Hola! Bienvenido al asistente virtual de *MAYCOOP* 🏢\n\nPor favor, elegí una opción escribiendo el número:\n\n1️⃣ Soy Socio y quiero consultar mi deuda\n2️⃣ Quiero información sobre préstamos\n3️⃣ Hablar con un asesor";
        await enviarMensaje(saludo);
        this.sesionesActivas.set(numero, PasoBot.MENU_PRINCIPAL);
    }

    private async manejadorMenuPrincipal(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const opcion = texto.trim(); 

        if (opcion === '1') {
            await enviarMensaje("Perfecto. Por favor, escribí tu *DNI* (solo números, sin puntos ni espacios) para buscarte en el sistema.");
            this.sesionesActivas.set(numero, PasoBot.ESPERANDO_DNI);
        } 
        else if (opcion === '2') {
            await enviarMensaje("Nuestros préstamos tienen la tasa más baja. Podés ver los requisitos acá: [LINK_WEB].\n\n_Escribí 'Volver' para ir al inicio._");
        }
        else if (opcion === '3') {
            await enviarMensaje("Derivando tu consulta a un humano... 👨‍💻 Aguardá un momento.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        }
        else {
            await enviarMensaje("❌ Opción no válida. Por favor, escribí 1, 2 o 3.");
        }
    }

    private async manejadorEsperandoDni(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const dni = texto.trim();

        // Pequeño filtro: Validamos que haya mandado solo números con una Expresión Regular
        if (!/^\d+$/.test(dni)) {
            await enviarMensaje("❌ El DNI debe contener solo números. Intentá de nuevo:");
            return;
        }

        await enviarMensaje("⏳ Buscando en la base de datos...");

        // Usamos la clase de base de datos que armamos al principio
        const socio = await this.db.buscarSocioPorDNI(dni);

        if (socio) {
            const respuesta = `👤 *Socio Encontrado*\n\nNombre: ${socio.nombre}\nEstado: ${socio.estado}\n💰 *Deuda Total: $${socio.deudaTotal}*\n\n_Escribí 'Hola' para volver al inicio._`;
            await enviarMensaje(respuesta);
            this.sesionesActivas.delete(numero); // Terminó el flujo, lo sacamos del Map
        } else {
            await enviarMensaje("❌ No encontramos ningún socio asociado a ese DNI en nuestra base. Verificá el número e intentá de nuevo, o escribí 'Volver' para salir.");
        }
    }
}