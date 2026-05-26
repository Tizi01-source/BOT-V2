import { DatabaseManager, InfoSocio } from '../services/Database';
import { MENUS } from '../config/menus';

// documentar luego.

export enum PasoBot {
    INICIO = 'INICIO',
    MENU_PRINCIPAL = 'MENU_PRINCIPAL',
    ESPERANDO_DNI = 'ESPERANDO_DNI',
    CONFIRMANDO_DNI = 'CONFIRMANDO_DNI', 
    HABLANDO_CON_HUMANO = 'HABLANDO_CON_HUMANO',
    MENU_MORA = 'MENU_MORA',
    MENU_ACTIVO = 'MENU_ACTIVO',
    MENU_DOS_ACTIVOS = 'MENU_DOS_ACTIVOS', 
    MENU_NUEVO = 'MENU_NUEVO',
    SIMULADOR_CUOTAS = 'SIMULADOR_CUOTAS',
    ESPERANDO_CANTIDAD_CUOTAS = 'ESPERANDO_CANTIDAD_CUOTAS' 
}

export class BotController {
    private sesionesActivas: Map<string, PasoBot>;
    private temporizadores: Map<string, NodeJS.Timeout>;
    private db: DatabaseManager;
    private deudaTemporal: Map<string, number>;
    private dniTemporal: Map<string, string>;
    private datosSocioTemporal: Map<string, InfoSocio>; 

    constructor(db: DatabaseManager) {
        this.sesionesActivas = new Map();
        this.temporizadores = new Map();
        this.deudaTemporal = new Map();
        this.dniTemporal = new Map();
        this.datosSocioTemporal = new Map();
        this.db = db;
    }

    private reiniciarTemporizador(numero: string, enviarMensaje: Function): void {
        if (this.temporizadores.has(numero)) clearTimeout(this.temporizadores.get(numero));

        const nuevoReloj = setTimeout(async () => {
            this.forzarCierreSesion(numero);
            await enviarMensaje("Tu sesión expiró por inactividad. Si necesitás hacer otra consulta, escribí *'Hola'* para volver a empezar.");
        }, 600000); 

        this.temporizadores.set(numero, nuevoReloj);
    }

    public async procesarMensaje(numero: string, texto: string, enviarMensaje: (texto: string) => Promise<void>, asignarEtiqueta: (etiqueta: string) => Promise<void>): Promise<void> {
        this.reiniciarTemporizador(numero, enviarMensaje);
        
        if (texto.toLowerCase() === 'hola' || texto.toLowerCase() === 'volver') {
            this.sesionesActivas.set(numero, PasoBot.INICIO);
        }

        const pasoActual = this.sesionesActivas.get(numero) || PasoBot.INICIO;
        console.log(`Procesando a ${numero} en el paso: ${pasoActual}`);

        switch (pasoActual) {
            case PasoBot.INICIO:
                await enviarMensaje(MENUS.SALUDO_PRINCIPAL);
                this.sesionesActivas.set(numero, PasoBot.MENU_PRINCIPAL);
                break;
            case PasoBot.MENU_PRINCIPAL:
                await this.manejadorMenuPrincipal(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.ESPERANDO_DNI:
                await this.manejadorEsperandoDni(numero, texto, enviarMensaje);
                break;
            case PasoBot.CONFIRMANDO_DNI:
                await this.manejadorConfirmandoDni(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.MENU_NUEVO:
                await this.manejadorMenuNuevo(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.MENU_ACTIVO:
                await this.manejadorMenuActivo(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.MENU_DOS_ACTIVOS:
                await this.manejadorMenuDosActivos(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.MENU_MORA:
                await this.manejadorMenuMora(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.SIMULADOR_CUOTAS:
                await this.manejadorSimuladorCuotas(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.ESPERANDO_CANTIDAD_CUOTAS:
                await this.manejadorCantidadCuotas(numero, texto, enviarMensaje, asignarEtiqueta);
                break;
            case PasoBot.HABLANDO_CON_HUMANO:
                // No hacemos nada
                break;
            default:
                this.forzarCierreSesion(numero);
                await enviarMensaje("Ocurrió un error. Escribí 'Hola' para empezar de nuevo.");
                break;
        }
    }

    public forzarCierreSesion(numero: string): void {
        this.sesionesActivas.delete(numero);
        this.deudaTemporal.delete(numero);
        this.dniTemporal.delete(numero);
        this.datosSocioTemporal.delete(numero);

        if (this.temporizadores.has(numero)) {
            clearTimeout(this.temporizadores.get(numero));
            this.temporizadores.delete(numero);
        }
    }

    private async manejadorMenuPrincipal(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const opcion = texto.trim(); 
        if (opcion === '1') {
            await enviarMensaje(MENUS.SOLICITAR_DNI);
            this.sesionesActivas.set(numero, PasoBot.ESPERANDO_DNI);
        } else if (opcion === '2') {
            await enviarMensaje(MENUS.INFO_PRESTAMOS);
        } else if (opcion === '3') {
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            await asignarEtiqueta("CONSULTA");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async manejadorEsperandoDni(numero: string, texto: string, enviarMensaje: Function): Promise<void> {
        const dni = texto.trim();
        if (!/^\d+$/.test(dni) || dni.length < 7 || dni.length > 9) {
            await enviarMensaje(MENUS.DNI_INVALIDO);
            return;
        }
        
        this.dniTemporal.set(numero, dni);
        await enviarMensaje(MENUS.CONFIRMAR_DNI(dni));
        this.sesionesActivas.set(numero, PasoBot.CONFIRMANDO_DNI);
    }

    private async manejadorConfirmandoDni(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const opcion = texto.trim();
        
        if (opcion === '2') {
            await enviarMensaje(MENUS.SOLICITAR_DNI);
            this.sesionesActivas.set(numero, PasoBot.ESPERANDO_DNI);
            return;
        } else if (opcion !== '1') {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
            return;
        }

        const dni = this.dniTemporal.get(numero)!;
        await enviarMensaje(MENUS.BUSCANDO);

        const socio = await this.db.buscarSocioTotal(dni);

        if (!socio) {
            await enviarMensaje(MENUS.SOCIO_NO_ENCONTRADO);
            this.sesionesActivas.set(numero, PasoBot.MENU_NUEVO);
            return;
        }

        this.datosSocioTemporal.set(numero, socio);

        if (socio.estadoGlobal === 'REFINANCIACION' || socio.estadoGlobal === 'AMBAS') {
            this.deudaTemporal.set(numero, socio.deudaTotal);
            await asignarEtiqueta("MORA"); 
            await enviarMensaje(MENUS.generarMenuMora(socio.nombre, socio.deudaTotal));
            this.sesionesActivas.set(numero, PasoBot.MENU_MORA);

        } else if (socio.estadoGlobal === 'CASHFLOW') {
            await enviarMensaje(MENUS.generarMenuActivo(socio));
            this.sesionesActivas.set(numero, socio.tieneAmbos ? PasoBot.MENU_DOS_ACTIVOS : PasoBot.MENU_ACTIVO);
        } else {
            await enviarMensaje(MENUS.SOCIO_NO_ENCONTRADO);
            this.sesionesActivas.set(numero, PasoBot.MENU_NUEVO);
        }
    }

    // --- MENÚS ---

    private async manejadorMenuMora(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const opcion = texto.trim();
        if (opcion === '1') {
            const deuda = this.deudaTemporal.get(numero) || 0;
            const c1 = deuda.toLocaleString('es-AR');
            const c3 = Math.round(deuda / 3).toLocaleString('es-AR');
            const c6 = Math.round(deuda / 6).toLocaleString('es-AR');
            
            const msjSimulador = `📊 *Simulador de Cuotas*\n\n` +
                `Tu saldo a regularizar es de *$${c1}*.\n\n` +
                `Opciones de financiación:\n` +
                `1️⃣ 1 pago de *$${c1}*\n` +
                `2️⃣ 3 pagos de *$${c3}*\n` +
                `3️⃣ 6 pagos de *$${c6}*\n` +
                `4️⃣ Elegir otra cantidad de cuotas\n\n` +
                `5️⃣ Hablar con Asesor\n\n` +
                `👉 Por favor, respondé con el *número de la opción* que preferís.`;

            await enviarMensaje(msjSimulador);
            this.sesionesActivas.set(numero, PasoBot.SIMULADOR_CUOTAS);

        } else if (opcion === '2') {
            await enviarMensaje("Por favor, envianos la foto o PDF del comprobante por este medio. Un asesor de cobranzas lo revisará a la brevedad.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '3') {
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '4') {
            await enviarMensaje("¡Gracias por comunicarte con MAYCOOP! 👋\n\n_Escribí 'Hola' para volver a empezar._");
            this.forzarCierreSesion(numero);
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async enviarDatosDePago(enviarMensaje: Function, cuotas: number, valorCuota: number): Promise<void> {
        const msj = `✅ Perfecto. Has seleccionado el plan de *${cuotas} cuota(s)* de *$${valorCuota.toLocaleString('es-AR')}*.\n\n` +
                    `🏦 *DATOS PARA EL PAGO*\n` +
                    `Alias: MAYCOOPBAPRO\n` +
                    `Link MP: https://link.mercadopago.com.ar/maycoopcooperativa\n\n` +
                    `📸 Para avanzar, realizá el primer pago y *envianos la foto o PDF del comprobante* por este chat.\n\n` +
                    `Un asesor revisará tu pago a la brevedad para impactarlo en el sistema. 👨‍💻`;
        
        await enviarMensaje(msj);
    }

    private async manejadorSimuladorCuotas(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const opcion = texto.trim();
        const deuda = this.deudaTemporal.get(numero) || 0;

        if (['1', '2', '3'].includes(opcion)) {
            let cuotasElegidas = opcion === '1' ? 1 : opcion === '2' ? 3 : 6;
            let valorCuota = Math.round(deuda / cuotasElegidas);
            
            await this.enviarDatosDePago(enviarMensaje, cuotasElegidas, valorCuota);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);

        } else if (opcion === '4') {
            await enviarMensaje("Escribí en números *en cuántas cuotas* te gustaría cancelar tu deuda (Ejemplo: 4):");
            this.sesionesActivas.set(numero, PasoBot.ESPERANDO_CANTIDAD_CUOTAS);
        } else if (opcion === '5') {
            await enviarMensaje("Derivando tu consulta con un asesor. Por favor contanos cuál es tu duda. 👨‍💻");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async manejadorCantidadCuotas(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const cuotas = parseInt(texto.trim());
        const deuda = this.deudaTemporal.get(numero) || 0;

        if (isNaN(cuotas) || cuotas <= 0 || cuotas > 24) {
            await enviarMensaje("❌ Cantidad inválida. Ingresá un número entre 1 y 24:");
            return;
        }

        let valorCuota = Math.round(deuda / cuotas);
        await this.enviarDatosDePago(enviarMensaje, cuotas, valorCuota);
        this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
    }

    // --- MENÚS ACTIVOS / NUEVOS ---

    private async manejadorMenuActivo(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const opcion = texto.trim();
        if (opcion === '1') {
            await asignarEtiqueta("CREDITO");
            await enviarMensaje("¡Qué bueno que quieras renovar! 🥳 Para evaluar tu solicitud enviá tu *Recibo de Haberes y Movimientos Bancarios*. Un comercial se pondrá en contacto.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '2') {
            await asignarEtiqueta("CONSULTA");
            await enviarMensaje("Por favor, escribinos qué datos necesitás actualizar (domicilio, teléfono, mail, etc.) y los cambiaremos en el sistema.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '3') {
            await asignarEtiqueta("CONSULTA");
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '4') {
            await enviarMensaje("¡Gracias por comunicarte con MAYCOOP! 👋");
            this.forzarCierreSesion(numero);
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async manejadorMenuNuevo(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const opcion = texto.trim();
        if (opcion === '1') {
            await asignarEtiqueta("CREDITO");
            await enviarMensaje("¡Excelente decisión! 🎉 Para iniciar la solicitud, por favor enviá tu *Recibo de Haberes y Movimientos Bancarios*. Un comercial evaluará tu perfil.");
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '2') {
            await asignarEtiqueta("CONSULTA");
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
        } else if (opcion === '3') {
            await enviarMensaje("¡Gracias por comunicarte con MAYCOOP! 👋");
            this.forzarCierreSesion(numero);
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }

    private async manejadorMenuDosActivos(numero: string, texto: string, enviarMensaje: Function, asignarEtiqueta: Function): Promise<void> {
        const opcion = texto.trim();
        const socio = this.datosSocioTemporal.get(numero);

        if (!socio) {
            this.forzarCierreSesion(numero);
            return;
        }

        if (opcion === '1' || opcion === '2') {
            const credito = opcion === '1' ? socio.cbu : socio.haberes;
            
            if (!credito) {
                await enviarMensaje(MENUS.OPCION_INVALIDA);
                return;
            }
            
            let fechaCorta = credito.fecha.split('T')[0] || credito.fecha; 
            let msjDetalle = `📄 *Detalle de tu crédito por ${credito.metodo}:*\n` +
                       `🔹 *Fecha:* ${fechaCorta}\n` +
                       `🔹 *Monto Otorgado:* $${credito.montoSacado.toLocaleString('es-AR')}\n` +
                       `🔹 *Cuotas Pagas:* ${credito.cuotasPagas} de ${credito.plazo}\n` +
                       `🔹 *Valor Cuota:* $${credito.montoCuota.toLocaleString('es-AR')}\n\n` +
                       `👉 *¿Qué más querés hacer?*\n` +
                       `1️⃣ Ver datos crédito CBU\n` +
                       `2️⃣ Ver datos crédito Haberes\n` +
                       `3️⃣ Hablar con un asesor\n` +
                       `4️⃣ Salir`;
            
            await enviarMensaje(msjDetalle);
            
        } else if (opcion === '3') { 
            await asignarEtiqueta("CONSULTA");
            await enviarMensaje(MENUS.DERIVAR_HUMANO);
            this.sesionesActivas.set(numero, PasoBot.HABLANDO_CON_HUMANO);
            
        } else if (opcion === '4') { 
            await enviarMensaje("¡Gracias por comunicarte con MAYCOOP! 👋");
            this.forzarCierreSesion(numero);
            
        } else {
            await enviarMensaje(MENUS.OPCION_INVALIDA);
        }
    }
}