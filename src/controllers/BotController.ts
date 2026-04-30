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
    private db: DatabaseManager;

    constructor(db: DatabaseManager) {
        this.sesionesActivas = new Map();
        this.db = db;
    }

    public async procesarMensaje(numero: string, texto: string, enviarMensaje: (texto: string) => Promise<void>): Promise<void> {
        
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

                await this.manejadorEsperandoDni(numero, texto, enviarMensaje);
                break;
                
            case PasoBot.MENU_NUEVO:
            case PasoBot.MENU_ACTIVO:
            case PasoBot.MENU_MORA:

                // Por ahora, cualquier opción en estos submenús puede llevar a un humano o terminar
                await enviarMensaje(MENUS.DERIVAR_HUMANO);
                this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
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

    private async manejadorEsperandoDni(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const dni = texto.trim();

        if (!/^\d+$/.test(dni)) {
            await enviarMensaje(MENUS.DNI_INVALIDO);
            return;
        }

        await enviarMensaje(MENUS.BUSCANDO);

        // Llamamos a la función optimizada
        // IMPORTANTE: Asegurate de que en Database.ts la función se llame buscarSocioTotal
        const socio = await this.db.buscarSocioTotal(dni);

        if (!socio) {
            await enviarMensaje(MENUS.SOCIO_NO_ENCONTRADO);
            this.sesionesActivas.set(numero, PasoBot.MENU_NUEVO);
            return;
        }

        // Lógica de ruteo basada en la hoja donde se encontró
        if (socio.hoja === 'REFINANCIACION') {
            await enviarMensaje(MENUS.generarMenuMora(socio.nombre, socio.deuda));
            this.sesionesActivas.set(numero, PasoBot.MENU_MORA);
        } else if (socio.hoja === 'CASHFLOW') {
            await enviarMensaje(MENUS.generarMenuActivo(socio.nombre));
            this.sesionesActivas.set(numero, PasoBot.MENU_ACTIVO);
        }
    }
}