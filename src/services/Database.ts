import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export interface Socio {
    dni: string;
    nombre: string;
    estado: 'ACTIVO' | 'REFI' | 'CANCELADO';
    deudaTotal: number;
    haberes: InfoCredito;
    cbu: InfoCredito;
    tieneAmbos: boolean;
}

export interface InfoCredito {
    tiene: boolean;
    esMora: boolean;
    esActivo: boolean;
    deuda: number;
    nroCredito: string;
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
            const dniLimpio = this.limpiarDNI(dni);

            // Cargamos las hojas
            const hojaCashflow = this.doc.sheetsByIndex[0]; // Cashflow
            const hojaRefi = this.doc.sheetsByTitle['REFINANCIACION'] || this.doc.sheetsByIndex[1];

            // Obtenemos las filas (limitado para no reventar la memoria)
            const filasCashflow = await hojaCashflow.getRows();
            const filasRefi = await hojaRefi.getRows();

            // Filtramos los registros que coincidan con el DNI (buscando dentro del CUIL)
            const coincidenCashflow = filasCashflow.filter(fila => this.contieneDNI(fila.get('CUIL'), dniLimpio));
            const coincidenRefi = filasRefi.filter(fila => this.contieneDNI(fila.get('CUIL'), dniLimpio));

            // Si no está en ninguna de las dos hojas, no es socio
            if (coincidenCashflow.length === 0 && coincidenRefi.length === 0) {
                return null;
            }

            // Procesamos la información separando por CBU y Haberes
            const infoHaberes = this.procesarCreditos(coincidenCashflow, coincidenRefi, 'HABERES');
            const infoCBU = this.procesarCreditos(coincidenCashflow, coincidenRefi, 'CBU');

            // Calculamos el Estado Global
            let estadoGlobal: 'ACTIVO' | 'REFI' | 'CANCELADO' = 'CANCELADO';
            if (infoHaberes.esMora || infoCBU.esMora) {
                estadoGlobal = 'REFI';
            } else if (infoHaberes.esActivo || infoCBU.esActivo) {
                estadoGlobal = 'ACTIVO';
            }

            // Calculamos la Deuda Total
            const deudaTotal = (infoHaberes.esMora ? infoHaberes.deuda : 0) + (infoCBU.esMora ? infoCBU.deuda : 0);

            // Formateamos el Nombre (Prioridad Cashflow, luego Refi)
            const nombreSocio = this.obtenerNombre(coincidenCashflow, coincidenRefi);

            return {
                dni: dniLimpio,
                nombre: nombreSocio,
                estado: estadoGlobal,
                deudaTotal: deudaTotal,
                haberes: infoHaberes,
                cbu: infoCBU,
                tieneAmbos: infoHaberes.tiene && infoCBU.tiene
            };

        } catch (error) {
            console.error(`Error buscando al socio con DNI ${dni}:`, error);
            return null;
        }
    }

    // =========================================================
    // 🛠️ MÉTODOS PRIVADOS (HERRAMIENTAS INTERNAS)
    // =========================================================

    private limpiarDNI(dni: string): string {
        return dni.toString().replace(/\D/g, ''); // Deja solo los números
    }

    private contieneDNI(cuil: string | undefined, dniLimpio: string): boolean {
        if (!cuil) return false;
        return cuil.toString().replace(/\D/g, '').includes(dniLimpio);
    }

    private limpiarMonto(montoStr: any): number {
        if (!montoStr) return 0;
        const limpio = montoStr.toString().replace(/[^\d,-]/g, '').replace(',', '.');
        return parseFloat(limpio) || 0;
    }

    private esFiltroValido(metodo: string | undefined, tipo: 'CBU' | 'HABERES'): boolean {
        if (!metodo) return false;
        const met = metodo.toString().toUpperCase();
        
        if (tipo === 'CBU') {
            return met.includes('CBU'); // Filtra "CBU", "CBU C", etc.
        } else {
            // Es Haberes si NO es CBU (o podés agregar la lógica exacta de CONHER, MUNI, etc.)
            return !met.includes('CBU'); 
        }
    }

    private procesarCreditos(filasCash: GoogleSpreadsheetRow[], filasRefi: GoogleSpreadsheetRow[], tipo: 'CBU' | 'HABERES'): InfoCredito {
        // Objeto por defecto
        let info: InfoCredito = { tiene: false, esMora: false, esActivo: false, deuda: 0, nroCredito: '' };

        // 1. BUSCAMOS PRIMERO EN REFINANCIACION (La verdad absoluta)
        const creditoEnRefi = filasRefi.find(fila => this.esFiltroValido(fila.get('METODO'), tipo));

        if (creditoEnRefi) {
        const estadoRefi = creditoEnRefi.get('ESTADO')?.toString().toUpperCase();
        
        if (estadoRefi === 'CANCELADO') {
            // Si en Refi dice cancelado, ignoramos cualquier otra hoja.
            info.tiene = true;
            info.esMora = false;
            info.esActivo = false;
            return info; 
        } else {
            // Si está en Refi y NO está cancelado, está en MORA.
            info.tiene = true;
            info.esMora = true;
            info.deuda = parseFloat(creditoEnRefi.get('DEUDA ACTUAL') || creditoEnRefi.get('DEUDA') || '0') || 0;
            info.nroCredito = creditoEnRefi.get('NRO CRED') || '';
            return info;
        }
        }

        // 2. SOLO SI NO EXISTE EN REFI, BUSCAMOS EN CASHFLOW
        const creditoCash = filasCash.find(fila => 
        this.esFiltroValido(fila.get('METODO'), tipo) &&
        !['ANSES', 'FALLECIO'].includes(fila.get('ESTADO')?.toString().toUpperCase())
        );

        if (creditoCash) {
            info.tiene = true;
            const estado = creditoCash.get('ESTADO')?.toString().toUpperCase();
            info.esActivo = (estado === 'ACTIVO');
            info.nroCredito = creditoCash.get('NRO CRED') || '';
        }
        return info;
    }

    private obtenerNombre(filasCash: GoogleSpreadsheetRow[], filasRefi: GoogleSpreadsheetRow[]): string {
        if (filasCash.length > 0) {
            const nombre = filasCash[0].get('NOMBRE') || '';
            const apellido = filasCash[0].get('APELLIDO') || '';
            if (nombre || apellido) return `${nombre} ${apellido}`.trim();
            
            // Alternativa por si en Cashflow se llama "APELLIDO Y NOMBRE"
            return filasCash[0].get('APELLIDO Y NOMBRE')?.toString().trim() || "Socio";
        } else if (filasRefi.length > 0) {
            return filasRefi[0].get('APELLIDO Y NOMBRE')?.toString().trim() || "Socio";
        }
        return "Socio";
    }
}
