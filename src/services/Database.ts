import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export interface Socio {
    dni: string;
    nombre: string;
    estado: string;
    deudaTotal: number;
}

export class DatabaseManager {
    private doc: GoogleSpreadsheet;

    // Ahora le pasamos las credenciales al momento de crear la clase
    constructor(spreadsheetId: string, clientEmail: string, privateKey: string) {
        // Inicializamos la autenticación oficial de Google
        const jwt = new JWT({
            email: clientEmail,
            key: privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        // Creamos el documento ya autenticado
        this.doc = new GoogleSpreadsheet(spreadsheetId, jwt);
    }

    public async conectar(): Promise<void> {
        try {
            console.log('⏳ Conectando a la base de datos de la Cooperativa...');
            
            // Ya no hace falta el "useServiceAccountAuth" acá, solo cargamos la info
            await this.doc.loadInfo(); 
            console.log(`✅ Base de datos conectada: ${this.doc.title}`);

        } catch (error) {
            console.error('❌ Error crítico al conectar a Google Sheets:', error);
            throw error;
        }
    }

    public async buscarSocioPorDNI(dni: string): Promise<Socio | null> {
        try {
            const hojaSocios = this.doc.sheetsByTitle['SOCIOS'];
            const filas = await hojaSocios.getRows();

            // En TypeScript, a veces hay que avisarle que la fila es un objeto clave-valor
            const filaEncontrada = filas.find(fila => fila.get('DNI') === dni);

            if (!filaEncontrada) {
                return null;
            }

            return {
                dni: filaEncontrada.get('DNI'),
                nombre: filaEncontrada.get('NOMBRE'),
                estado: filaEncontrada.get('ESTADO'),
                // Parseamos la deuda y si viene vacía o rara, le ponemos 0
                deudaTotal: parseFloat(filaEncontrada.get('DEUDA TOTAL')) || 0
            };

        } catch (error) {
            console.error(`Error buscando al socio con DNI ${dni}:`, error);
            return null;
        }
    }
}