import 'dotenv/config';
import { DatabaseManager } from './services/Database';
import { WhatsAppClient } from './core/WhatsAppClient';
import { BotController } from './controllers/BotController';

// Funcion principal.
async function main() {
    console.log('🚀 Iniciando el Bot de la Cooperativa (Versión Súper Molde)...');

    // Rescatamos las variables del .env
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!spreadsheetId || !clientEmail || !privateKey) {
        console.error('❌ Faltan credenciales en el archivo .env. Por favor, revisalo.');
        process.exit(1); // Se apaga el programa por seguridad.
    }

    // Crea la Base de Datos.
    const baseDeDatos = new DatabaseManager(
        spreadsheetId as string, 
        clientEmail as string, 
        privateKey as string);
    // Crea el controlador y le inyectamos la BD.
    const botController = new BotController(baseDeDatos);
    // Crea el WhatsApp y le inyectamos el controlador.
    const botWhatsApp = new WhatsAppClient(botController);

    try {
        // Conectamos la base de datos
        await baseDeDatos.conectar();

        // Si la base de datos conecto bien, prendemos WhatsApp.
        await botWhatsApp.iniciar();
        
        console.log('✅ Sistema inicializado correctamente.');

    } catch (error) {
        console.error('❌ Error fatal durante el inicio:', error);
    }
}

// Ejecutamos la funcion principal.
main();