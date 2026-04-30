import { DatabaseManager } from '../services/Database';
import { MENUS } from '../config/menus';

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
    private temporizadores: Map<string, NodeJS.Timeout>;
    private db: DatabaseManager;

    constructor(db: DatabaseManager) {
        this.sesionesActivas = new Map();
        this.temporizadores = new Map();
        this.db = db;
    }

    // La función mágica que maneja el reloj
    private reiniciarTemporizador(numero: string, enviarMensaje: Function): void {
        // Si el usuario ya tenía un reloj corriendo, lo destruimos
        if (this.temporizadores.has(numero)) {
            clearTimeout(this.temporizadores.get(numero));
        }

        // Creamos un reloj nuevo. Si pasan 10 minutos (600000 ms) sin que se cancele, explota y ejecuta esto:
        const nuevoReloj = setTimeout(async () => {
            this.sesionesActivas.delete(numero);
            this.temporizadores.delete(numero);
            await enviarMensaje(
                "⏳ Tu sesión expiró por inactividad. Si necesitás hacer otra consulta, escribí *'Hola'* para volver a empezar.");
        }, 600000); 

        // Guardamos el reloj en nuestra memoria RAM
        this.temporizadores.set(numero, nuevoReloj);
    }


    public async procesarMensaje(
         numero: string,
         texto: string, 
         enviarMensaje: (texto: string) => Promise<void>,
         asignarEtiqueta: (etiqueta: string) => Promise<void>
    ): Promise<void> {

        this.reiniciarTemporizador(numero, enviarMensaje);
        
        if (texto.toLowerCase() === 'hola' || texto.toLowerCase() === 'volver') {
            this.sesionesActivas.set(numero, PasoBot.INICIO);
        }

        const pasoActual = this.sesionesActivas.get(numero) || PasoBot.INICIO;
        console.log(`🧠 Procesando a ${numero} en el paso: ${pasoActual}`);

        switch (pasoActual) {
            case PasoBot.INICIO:

                await enviarMensaje(MENUS.SALUDO_PRINCIPAL);
                this.sesionesActivas.set(numero, PasoBot.MENU_PRINCIPAL);
                break;

            case PasoBot.MENU_PRINCIPAL:

                await this.manejadorMenuPrincipal(numero, texto, enviarMensaje);
                break;

            case PasoBot.ESPERANDO_DNI:

                await this.manejadorEsperandoDni(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
                
            case PasoBot.MENU_NUEVO:

                await this.manejadorMenuNuevo(numero, texto, enviarMensaje);
                break;

            case PasoBot.MENU_ACTIVO:

                await this.manejadorMenuActivo(numero, texto, enviarMensaje);
                break;

            case PasoBot.MENU_MORA:

                await this.manejadorMenuMora(numero, texto, enviarMensaje);
                break;

            case PasoBot.HABLANDO_CON_HUMANO:

                // No hacemos nada, el bot ignora hasta que escriban 'volver'

                break;
            default:
                this.sesionesActivas.delete(numero);
                await enviarMensaje("Ocurrió un error. Escribí 'Hola' para empezar de nuevo.");
                break;
        }
    }

    // Permite que otra clase (como WhatsApp) mate la sesión de un usuario
    public forzarCierreSesion(numero: string): void {
        this.sesionesActivas.delete(numero);
        if (this.temporizadores.has(numero)) {
            clearTimeout(this.temporizadores.get(numero));
            this.temporizadores.delete(numero);
        }
    }

    private async manejadorMenuPrincipal(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const opcion = texto.trim(); 

        if (opcion === '1') {
            await enviarMensaje(MENUS.SOLICITAR_DNI);
            this.sesionesActivas.set(numero, PasoBot.ESPERANDO_DNI);
        } 
        else if (opcion === '2') {
            await enviarMensaje(MENUS.INFO_PRESTAMOS);
        }
        else if (opcion === '3') {
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        }
        else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async manejadorEsperandoDni(
        numero: string, 
        texto: string, 
        enviarMensaje: Function, 
        asignarEtiqueta: Function
        ): Promise<void> {

        const dni = texto.trim();

        if (!/^\d+$/.test(dni)) {
            await enviarMensaje(MENUS.DNI_INVALIDO);
            return;
        }

        await enviarMensaje(MENUS.BUSCANDO);

        // Llamamos a la función optimizada
        const socio = await this.db.buscarSocioTotal(dni);

        if (!socio) {
            await enviarMensaje(MENUS.SOCIO_NO_ENCONTRADO);
            this.sesionesActivas.set(numero, PasoBot.MENU_NUEVO);
            await asignarEtiqueta("SOCIO NUEVO");
            return;
        }

        // Lógica de ruteo basada en la hoja donde se encontró
        if (socio.hoja === 'REFINANCIACION' || socio.hoja === 'AMBAS') {

            await enviarMensaje(MENUS.generarMenuMora(socio.nombre, socio.deuda));
            this.sesionesActivas.set(numero, PasoBot.MENU_MORA);
            await asignarEtiqueta("SOCIO MORA");

        } else if (socio.hoja === 'CASHFLOW') {

            await enviarMensaje(MENUS.generarMenuActivo(socio.nombre));
            this.sesionesActivas.set(numero, PasoBot.MENU_ACTIVO);
            await asignarEtiqueta("SOCIO ACTIVO");
        }
    }

    // ==========================================
    // 🛠️ MANEJADORES DE SUB-MENÚS
    // ==========================================

    private async manejadorMenuMora(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const opcion = texto.trim();
        /* Menú Mora: 1. Opciones de pago | 2. Informar pago | 3. Cobranzas | 4. Salir */
        
        if (opcion === '1') {

            await enviarMensaje(
                "Podés ver nuestros planes de pago y medios habilitados ingresando a nuestro portal web o pidiendo hablar con cobranzas.\n\n_Escribí 'Volver' para ir al inicio._");

        } else if (opcion === '2') {

            await enviarMensaje("Por favor, envianos la foto o PDF del comprobante por este medio. Un asesor de cobranzas lo revisará a la brevedad.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);

        } else if (opcion === '3') {

            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);

        } else if (opcion === '4') {

            await enviarMensaje("¡Gracias por comunicarte con MAYCOOP! Que tengas un excelente día. 👋\n\n_Escribí 'Hola' para volver a empezar._");
            this.forzarCierreSesion(numero); // Terminamos la sesión

        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async manejadorMenuActivo(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const opcion = texto.trim();
        /* Menú Activo: 1. Estado de cuenta | 2. Solicitar renovación | 3. Modificar datos | 4. Asesor | 5. Salir */

        if (opcion === '1') {
            await enviarMensaje("Para consultar el detalle exacto de tus cuotas pagas y restantes, te voy a derivar con un asesor de cuentas.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '2') {
            await enviarMensaje("¡Qué bueno que quieras renovar! 🥳 Un asesor comercial revisará tu margen disponible y se pondrá en contacto.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '3') {
            await enviarMensaje("Por favor, escribinos por acá qué datos necesitás actualizar (domicilio, teléfono, mail, etc.) y los cambiaremos en el sistema.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '4') {
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '5') {
            await enviarMensaje("¡Gracias por comunicarte con MAYCOOP! Que tengas un excelente día. 👋\n\n_Escribí 'Hola' para volver a empezar._");
            this.forzarCierreSesion(numero);
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async manejadorMenuNuevo(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const opcion = texto.trim();
        /* Menú Nuevo/Cancelado: 1. Solicitar crédito | 2. Asesor | 3. Finalizar */

        if (opcion === '1') {
            await enviarMensaje("¡Excelente decisión! 🎉 Para iniciar la solicitud de tu nuevo crédito, te comunicaré con el área comercial.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '2') {
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '3') {
            await enviarMensaje("¡Gracias por comunicarte con MAYCOOP! Que tengas un excelente día. 👋\n\n_Escribí 'Hola' para volver a empezar._");
            this.forzarCierreSesion(numero);
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }
}