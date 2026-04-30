import 'dotenv/config'; // Esto lee el .env y carga las variables mágicamente
import { DatabaseManager } from './services/Database';
import { WhatsAppClient } from './core/WhatsAppClient';
import { BotController } from './controllers/BotController';

// Función principal asíncrona (el punto de entrada de nuestro programa)
async function main() {
    console.log('🚀 Iniciando el Bot de la Cooperativa (Versión Súper Molde)...');

    // 1. Rescatamos las variables de la "caja fuerte" (.env)
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    // TypeScript es estricto: nos obliga a verificar que las variables realmente existan
    // antes de usarlas, por si nos olvidamos de armar el .env
    if (!spreadsheetId || !clientEmail || !privateKey) {
        console.error('❌ Faltan credenciales en el archivo .env. Por favor, revisalo.');
        process.exit(1); // Apagamos el programa por seguridad
    }

    // 1. Creamos la Base de Datos
    const baseDeDatos = new DatabaseManager(
        spreadsheetId as string, 
        clientEmail as string, 
        privateKey as string);
    // 2. Creamos el Controlador y le inyectamos la BD
    const botController = new BotController(baseDeDatos);
    // 3. Creamos el WhatsApp y le inyectamos el Controlador
    const botWhatsApp = new WhatsAppClient(botController);

    try {
        // 1. Conectamos la base de datos primero
        await baseDeDatos.conectar();

        // 2. Si la base de datos conectó bien, prendemos WhatsApp
        await botWhatsApp.iniciar();
        
        console.log('✅ Sistema inicializado correctamente.');

    } catch (error) {
        console.error('❌ Error fatal durante el inicio:', error);
    }
}

// Ejecutamos la función principal
main();