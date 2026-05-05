import 'dotenv/config';
import { DatabaseManager } from './services/Database';
import { WhatsAppClient } from './core/WhatsAppClient';
import { BotController } from './controllers/BotController';

// Funcion principal.
async function main() {
    console.log('Iniciando Bot de MAYCOOP...');

    // Variables del .env
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!spreadsheetId || !clientEmail || !privateKey) {
        console.error('Faltan credenciales en el archivo .env.');
        process.exit(1); // Se apaga el programa por seguridad.
    }

    // Crea la Base de Datos.
    const baseDeDatos = new DatabaseManager(
        spreadsheetId as string, 
        clientEmail as string, 
        privateKey as string);
    // Crea el controlador y le inyecta la BD.
    const botController = new BotController(baseDeDatos);
    // Crea el WhatsApp y le inyecta el controlador.
    const botWhatsApp = new WhatsAppClient(botController);

    try {
        // Conecta la base de datos
        await baseDeDatos.conectar();

        // Si la base de datos conecto bien, prende WhatsApp.
        await botWhatsApp.iniciar();
        
        console.log('Sistema inicializado correctamente.');

    } catch (error) {
        console.error('Error fatal durante el inicio:', error);
    }
}

// Ejecuta la funcion principal.
main();