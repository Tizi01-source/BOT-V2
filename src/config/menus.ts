import { InfoSocio } from '../services/Database';



export const MENUS = {
    SALUDO_PRINCIPAL: 
    `¡Hola! Bienvenido al asistente virtual de *MAYCOOP* 🏢\n\n Por favor, elegí una opción escribiendo el número:\n\n 1️⃣ Soy Socio y quiero consultar mi deuda\n 2️⃣ Quiero información sobre préstamos\n 3️⃣ Hablar con un asesor`,
    
    SOLICITAR_DNI: 
    `Perfecto. Por favor, escribí tu *DNI* (solo números, sin puntos ni espacios) para buscarte en el sistema.`,
    
    INFO_PRESTAMOS: 
    `Nuestros préstamos tienen la tasa más baja. Podés ver los requisitos acá: [LINK_WEB].\n\n_Escribí 'Volver' para ir al inicio._`,
    
    DERIVAR_HUMANO: 
    `Derivando tu consulta a un humano... 👨‍💻 Aguardá un momento.`,
    
    OPCION_INVALIDA: 
    `❌ Opción no válida. Por favor, elegí una opción correcta.`,
    
    DNI_INVALIDO: 
    `❌ El DNI debe contener solo números. Intentá de nuevo:`,
    
    BUSCANDO: 
    `⏳ Buscando en la base de datos...`,
    
    SOCIO_NO_ENCONTRADO: 
    `Actualmente no registramos créditos a tu nombre o tu DNI no figura en la base.\n\n¿En qué podemos ayudarte?\n\n 1️⃣ Solicitar un crédito\n 2️⃣ Hablar con un asesor\n 3️⃣ Finalizar consulta`,
    
    generarMenuMora: (nombre: string, deuda: number) => {
        // 👈 ACÁ LE PONEMOS EL MAQUILLAJE ARGENTINO
        const deudaFormateada = deuda.toLocaleString('es-AR'); 
        
        return `👤 *Hola ${nombre}*\n\n` +
               `Registramos un saldo pendiente o refinanciado de *$${deudaFormateada}* en tu cuenta.\n\n` +
               `Seleccioná una opción para regularizar tu situación:\n\n` +
               ` 1️⃣ Ver opciones de pago y cuotas\n` +
               ` 2️⃣ Informar un pago ya realizado\n` +
               ` 3️⃣ Hablar con un asesor de cobranzas\n` +
               ` 4️⃣ Salir`;
    },

    generarMenuActivo: (socio: InfoSocio) => { 
        
        let mensaje = `👤 *Hola ${socio.nombre}*\n\n` +
                      `¡Gracias por cumplir con tus pagos al día! 🥳\n\n` +
                      `📊 *Resumen de tu Crédito Activo:*\n`;

        // Si por algún motivo mágico no trajo los datos, mostramos algo genérico
        if (!socio.creditoActivo) {
            mensaje += `🔹 Saldo total: $${socio.deuda.toLocaleString('es-AR')}\n\n`;
        } else {
            const c = socio.creditoActivo;
            // Damos formato a las fechas de Excel si vienen raras (opcional)
            let fechaCorta = c.fecha.split('T')[0] || c.fecha; 

            mensaje += `🔹 *Crédito Nro:* ${c.nroCredito}\n` +
                       `🔹 *Fecha:* ${fechaCorta}\n` +
                       `🔹 *Monto Otorgado:* $${c.montoSacado.toLocaleString('es-AR')}\n` +
                       `🔹 *Plan:* ${c.plazo} cuotas\n` +
                       `🔹 *Cuotas Pagas:* ${c.cuotasPagas}\n` +
                       `🔹 *Valor de Cuota:* $${c.montoCuota.toLocaleString('es-AR')}\n\n`;

            // 🧠 LA LÓGICA DE UPGRADE (Docentes y IPS)
            const org = c.organismo.toUpperCase();
            const esDocenteOIPS = org.includes('CULTURA Y EDUCACION') || org.includes('PREVISION SOCIAL');
            const metodoActual = c.metodo.toUpperCase();

            if (esDocenteOIPS) {
                if (metodoActual === 'CBU') {
                    mensaje += `💡 *¡Tenés opciones disponibles!*\n` +
                               `Como pertenecés a IPS/Docentes y pagás por CBU, tenés pre-aprobado gestionar un nuevo crédito descontándolo directamente por **Recibo de Haberes**.\n\n`;
                } else {
                    mensaje += `💡 *¡Renovación disponible!*\n` +
                               `Como ya descontás por Haberes, podés gestionar un préstamo paralelo cobrado mediante **CBU**.\n\n`;
                }
            }
        }

        mensaje += `¿En qué te podemos ayudar hoy?\n\n` +
                   ` 1️⃣ Solicitar nuevo crédito / Renovación\n` +
                   ` 2️⃣ Modificar mis datos personales\n` +
                   ` 3️⃣ Hablar con un asesor\n` +
                   ` 4️⃣ Salir`;

        return mensaje;
    },
};