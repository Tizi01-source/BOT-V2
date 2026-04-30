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
        return `👤 *Hola ${nombre}*\n\nRegistramos un saldo pendiente o refinanciado de *$${deuda}*.\n\nSeleccioná una opción:\n\n 1️⃣ Ver opciones de pago\n 2️⃣ Informar un pago realizado\n 3️⃣ Hablar con cobranzas\n 4️⃣ Salir`;
    },
    
    generarMenuActivo: (nombre: string) => {
        return `👤 *Hola ${nombre}*\n\nTu crédito se encuentra vigente.\n\n¿Qué gestión deseás realizar?\n\n 1️⃣ Consultar estado de cuenta\n 2️⃣ Solicitar renovación o nuevo monto\n 3️⃣ Modificar mis datos de contacto\n 4️⃣ Hablar con un asesor\n 5️⃣ Salir`;
    }
};