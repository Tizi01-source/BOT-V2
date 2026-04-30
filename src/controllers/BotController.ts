import { DatabaseManager } from '../services/Database';

// Definimos los pasos fijos de nuestro bot
export enum PasoBot {
    INICIO = 'INICIO',
    MENU_PRINCIPAL = 'MENU_PRINCIPAL',
    ESPERANDO_DNI = 'ESPERANDO_DNI',
    HABLANDO_CON_HUMANO = 'HABLANDO_CON_HUMANO',
    MENU_MORA = 'MENU_MORA',
    MENU_ACTIVO = 'MENU_ACTIVO',
    MENU_NUEVO = 'MENU_NUEVO'
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

        if (!socio || socio.estado === 'CANCELADO') {
            // Si no existe o está cancelado, va al menú de nuevos
            const msjNuevo = 
            `Actualmente no registramos créditos activos a tu nombre.\n\n
            ¿En qué podemos ayudarte?\n
            1️⃣ Solicitar un crédito\n
            2️⃣ Hablar con un asesor\n
            3️⃣ Finalizar consulta`;

            await enviarMensaje(msjNuevo);
            this.sesionesActivas.set(numero, PasoBot.MENU_NUEVO);
            return;
        }

        if (socio.estado === 'REFI') {
            // Si tiene deuda, lo mandamos al menú de Mora
            let detalleDeuda = 
            `👤 *Hola ${socio.nombre}*\n
            Registramos un saldo pendiente de *$${socio.deudaTotal}*.\n\n`;
            
            // Si queremos ser súper específicos gracias a nuestra nueva base de datos:
            if (socio.cbu.esMora) detalleDeuda += 
            `🔸 Deuda CBU: $${socio.cbu.deuda}\n`;
            if (socio.haberes.esMora) detalleDeuda += 
            `🔸 Deuda Haberes: $${socio.haberes.deuda}\n`;

            detalleDeuda += 
            `\nSeleccioná una opción:\n
            1️⃣ Ver opciones de pago\n
            2️⃣ Informar un pago realizado\n
            3️⃣ Hablar con cobranzas\n
            4️⃣ Salir`;
            
            await enviarMensaje(detalleDeuda);
            this.sesionesActivas.set(numero, PasoBot.MENU_MORA);
            return;
        }

        if (socio.estado === 'ACTIVO') {
            // 1. Empezamos con el saludo
            let mensaje = 
            `👤 *Hola ${socio.nombre}*\n\n`;

            // 2. Lógica de detección de créditos activos
            if (socio.haberes.esActivo && socio.cbu.esActivo) {
                // CASO: Tiene los dos activos
                mensaje += 
                `Vemos que tenés *dos créditos vigentes* con nosotros (uno por Haberes y otro por CBU).`;
            } 
            else if (socio.haberes.esActivo) {
                // CASO: Solo Haberes activo (el de CBU puede no existir o estar cancelado)
                mensaje += 
                `Tu crédito por *Haberes* se encuentra vigente.`;
            } 
            else if (socio.cbu.esActivo) {
                // CASO: Solo CBU activo (el de Haberes puede no existir o estar cancelado)
                mensaje += 
                `Tu crédito por *CBU* se encuentra vigente.`;
            }

            // 3. Opciones del menú para activos
            mensaje += 
            `\n\n¿Qué gestión deseás realizar?\n` +
                    `1️⃣ Consultar estado de cuenta\n` +
                    `2️⃣ Solicitar renovación o nuevo monto\n` +
                    `3️⃣ Modificar mis datos de contacto\n` +
                    `4️⃣ Hablar con un asesor\n` +
                    `5️⃣ Salir`;

            await enviarMensaje(mensaje);
            
            // 4. Cambiamos el estado de la sesión para que el bot sepa qué opciones esperar ahora
            this.sesionesActivas.set(numero, PasoBot.MENU_ACTIVO);
            return;
}

        
    }
}