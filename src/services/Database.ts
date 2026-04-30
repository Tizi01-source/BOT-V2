import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export interface InfoSocio {
    nombre: string;
    dni: string;
    deuda: number;
    hoja: 'CASHFLOW' | 'REFINANCIACION';
}

export class DatabaseManager {
    private doc: GoogleSpreadsheet;

    constructor(spreadsheetId: string, clientEmail: string, privateKey: string) {
        // Configuramos la autenticación de Google
        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        this.doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    }

    public async conectar(): Promise<void> {
        try {
            console.log('⏳ Conectando a la base de datos (Google Sheets)...');
            await this.doc.loadInfo();
            console.log(`✅ Base de datos conectada. Documento: ${this.doc.title}`);
        } catch (error) {
            console.error('❌ Error al conectar con Google Sheets:', error);
            throw error;
        }
    }

    public async buscarSocioTotal(dniABuscar: string): Promise<InfoSocio | null> {
        // Aseguramos que el DNI sea texto para la comparación
        const dniStr = dniABuscar.trim();

        // 1. Buscar en REFINANCIACION primero (suele ser la deuda más urgente/actualizada)
        const hojaRefi = this.doc.sheetsByTitle['REFINANCIACION'];
        if (hojaRefi) {
            // El header_row en la librería es base 1. La fila 3 de Excel es el encabezado real
            await hojaRefi.loadHeaderRow(3); 
            const filas = await hojaRefi.getRows();
            
            // Buscamos si el CUIL contiene el DNI
            const encontrada = filas.find(f => {
                const cuil = f.get('CUIL')?.toString() || '';
                return cuil.includes(dniStr);
            });

            if (encontrada) {
                return {
                    nombre: encontrada.get('APELLIDO Y NOMBRE') || 'Socio',
                    dni: dniStr,
                    deuda: parseFloat(encontrada.get('MONTO ACTUALIZADO')) || 0,
                    hoja: 'REFINANCIACION'
                };
            }
        }

        // 2. Si no está en Refi, buscar en CASHFLOW
        const hojaCashflow = this.doc.sheetsByTitle['CASHFLOW'];
        if (hojaCashflow) {
            // En cashflow el encabezado está en la fila 2
            await hojaCashflow.loadHeaderRow(2); 
            const filas = await hojaCashflow.getRows();
            
            const encontrada = filas.find(f => {
                const cuil = f.get('CUIL')?.toString() || '';
                return cuil.includes(dniStr);
            });

            if (encontrada) {
                // Cashflow separa Apellido y Nombre
                const nombreCompleto = `${encontrada.get('APELLIDO') || ''} ${encontrada.get('NOMBRE') || ''}`.trim();
                
                // Buscamos la columna de deuda (asumo que se llama MONTO, ajustá si es otra)
                return {
                    nombre: nombreCompleto || 'Socio',
                    dni: dniStr,
                    deuda: parseFloat(encontrada.get('MONTO')) || 0, 
                    hoja: 'CASHFLOW'
                };
            }
        }

        // Si llegó acá, no lo encontró en ningún lado
        return null;
    }
}