import { InfoSocio } from '../services/Database'; // Importamos la interfaz InfoSocio para usarla en los menús.

// Archivo de configuración de los menús que el bot va a mostrar.

export const MENUS = {
    // Mensaje de bienvenida y opciones principales.
    SALUDO_PRINCIPAL: 
    `¡Hola! Bienvenido al asistente virtual de *MAYCOOP* 🏢\n\nPor favor, elegí una opción escribiendo el número:\n\n1️⃣ Soy Socio / Consultar mi deuda\n2️⃣ Quiero información sobre préstamos\n3️⃣ Hablar con un asesor`,
    
    // Mensaje para solicitar el DNI del usuario.
    SOLICITAR_DNI: 
    `Perfecto. Por favor, escribí tu *DNI* (solo números, sin puntos ni espacios):`,
    
    // Mensaje para confirmar el DNI ingresado por el usuario.
    CONFIRMAR_DNI: (dni: string) => 
    `Confirmame, ¿ingresaste el DNI: *${dni}*?\n\n1️⃣ Sí, es correcto\n2️⃣ No, lo escribí mal`,

    // Mensaje para mostrar información de préstamos y requisitos.
    INFO_PRESTAMOS: 
    `Nuestros préstamos tienen la tasa más baja. Podés ver los requisitos acá: [LINK_WEB].\n\n_Escribí 'Volver' para ir al inicio._`,
    
    // Mensaje para informar que se está derivando a un asesor humano.
    DERIVAR_HUMANO: 
    `Derivando tu consulta a un asesor... 👨‍💻 Aguardá un momento.`,
    
    // Mensaje para informar que la opción ingresada no es válida.
    OPCION_INVALIDA: 
    `❌ Opción no válida. Por favor, elegí un número de la lista.`,
    
    // Mensaje para informar que el DNI ingresado no es válido.
    DNI_INVALIDO: 
    `❌ El DNI debe contener solo números. Intentá de nuevo:`,
    
    // Mensaje para informar que se está buscando el DNI en la base de datos.
    BUSCANDO: 
    `⏳ Buscando en la base de datos...`,

    // Mensaje para informar que no se encontró el DNI o que no hay créditos asociados. 
    SOCIO_NO_ENCONTRADO: 
    `Actualmente no registramos créditos a tu nombre o tu DNI no figura en la base.\n\n¿En qué podemos ayudarte?\n\n1️⃣ Solicitar un crédito\n2️⃣ Hablar con un asesor\n3️⃣ Finalizar consulta`,
    
    // Función para generar el menú de opciones para socios con deuda o refinanciación.
    generarMenuMora: (nombre: string, deuda: number) => {
        const deudaFormateada = deuda.toLocaleString('es-AR'); 
        return `👤 *Hola ${nombre}*\n\n` +
               `Registramos un saldo pendiente o refinanciado de *$${deudaFormateada}* en tu cuenta.\n\n` +
               `Seleccioná una opción para regularizar tu situación:\n\n` +
               `1️⃣ Ver opciones de pago y cuotas\n` +
               `2️⃣ Informar un pago ya realizado\n` +
               `3️⃣ Hablar con un asesor de cobranzas\n` +
               `4️⃣ Salir`;
    },

    // Función para generar el menú de opciones para socios con créditos activos al día.
    generarMenuActivo: (socio: InfoSocio) => { 
        let mensaje = `👤 *Hola ${socio.nombre}*\n\n¡Gracias por cumplir con tus pagos al día! 🥳\n\n`;
        
        if (socio.tieneAmbos) {
            mensaje += `✅ Tenés dos créditos *ACTIVOS* con nosotros.\n\n¿Qué detalle necesitás ver?\n1️⃣ Ver datos crédito CBU\n2️⃣ Ver datos crédito Haberes\n3️⃣ Hablar con un asesor\n4️⃣ Salir`;
            return mensaje;
        }

        // Si solo tiene un crédito activo, mostramos directamente su resumen.
        const c = socio.haberes?.esActivo ? socio.haberes : socio.cbu;
        if (c) {
            let fechaCorta = c.fecha.split('T')[0] || c.fecha; 
            mensaje += `📊 *Resumen de tu Crédito por ${c.metodo}:*\n` +
                       `🔹 *Fecha:* ${fechaCorta}\n` +
                       `🔹 *Monto Otorgado:* $${c.montoSacado.toLocaleString('es-AR')}\n` +
                       `🔹 *Cuotas Pagas:* ${c.cuotasPagas} de ${c.plazo}\n` +
                       `🔹 *Valor de Cuota:* $${c.montoCuota.toLocaleString('es-AR')}\n\n`;
        }
        // Luego mostramos las opciones generales para crédito activo.
        mensaje += `¿En qué te podemos ayudar hoy?\n\n` +
                   `1️⃣ Solicitar nuevo crédito / Renovación\n` +
                   `2️⃣ Modificar mis datos personales\n` +
                   `3️⃣ Hablar con un asesor\n` +
                   `4️⃣ Salir`;
        return mensaje;
    },
};