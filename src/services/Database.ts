import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export interface InfoSocio {
    nombre: string;
    dni: string;
    deuda: number;
    hoja: 'CASHFLOW' | 'REFINANCIACION' | 'AMBAS';
    creditoActivo?: {
        fecha: string;
        metodo: string;
        organismo: string;
        nroCredito: string;
        montoSacado: number;
        plazo: string;
        cuotasPagas: string;
        montoCuota: number;
    }
}

export class DatabaseManager {
    private doc: GoogleSpreadsheet;

    constructor(spreadsheetId: string, clientEmail: string, privateKey: string) {
        // Configuracion la autenticacion de Google.
        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        this.doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    }

    public async conectar(): Promise<void> {
        try {
            console.log('Conectando a la base de datos...');
            await this.doc.loadInfo();
            console.log(`Base de datos conectada. Documento: ${this.doc.title}`);
        } catch (error) {
            console.error('Error al conectar con Google Sheets:', error);
            throw error;
        }
    }

    // Lee cualquier formato y redondea. Si no se puede parsear, devuelve 0.
    private parsearDinero(valor: any): number {
        if (valor === undefined || valor === null || valor === '') return 0;
        if (typeof valor === 'number') return Math.round(valor);
        
        let strVal = valor.toString().replace('$', '').replace(/\s/g, '');
        
        // Verifica si tiene ambos separadores (punto y coma).
        if (strVal.includes(',') && strVal.includes('.')) {
            // Si la coma esta despues del punto.
            if (strVal.indexOf(',') > strVal.indexOf('.')) {
                strVal = strVal.replace(/\./g, '').replace(',', '.');
            } 
            // Si el punto esta despues de la coma.
            else {
                strVal = strVal.replace(/,/g, '');
            }
        } 
        // Si solo tiene coma, asumimos decimales.
        else if (strVal.includes(',')) {
            strVal = strVal.replace(',', '.');
        } 
        // Si solo tiene puntos.
        else if (strVal.split('.').length > 2) {
            strVal = strVal.replace(/\./g, '');
        }

        const numero = parseFloat(strVal);
        return isNaN(numero) ? 0 : Math.round(numero); 
    }

    // Funcion auxiliar para formatear nombres.
    private formatearNombre(nombreCrudo: string): string {
        if (!nombreCrudo) return 'Socio';
        let partes = nombreCrudo.includes(',') ? nombreCrudo.split(',') : nombreCrudo.split(' ');
        if (nombreCrudo.includes(',')) partes = [partes[1], partes[0]]; 
        return partes.map(p => p.trim()).filter(p => p.length > 0).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }

    public async buscarSocioTotal(dniABuscar: string): Promise<InfoSocio | null> {
        const dniStr = dniABuscar.trim();
        
        let nombreSocio = '';
        let deudaTotal = 0;
        let esMoroso = false;
        let esActivo = false;
        let procesadoEnRefi = false; 
        let datosCreditoActivo: InfoSocio['creditoActivo'] = undefined;

        const ESTADOS_IGNORAR_O_CANCELADO = [
            'ANSES', 'FALLECIDO', 'CANCELADO', 'REFINANCIACION CANCELADO'
        ];
        const ESTADOS_MORA = [
            'SOTANO', 'REFINANCIACION V', 'REFINANCIACION', 'MOROSO', 
            'INCOBRABLE', 'ANALISIS MOV', 'SOTEIN', 
            'CONFINCRED', 'CONHER', 'DIAGRAMAS', 'MAGALI', 'MAYCOOP', 'TIZIANO'
        ];

        // REVISA HOJA REFINANCIACION
        const hojaRefi = this.doc.sheetsByTitle['REFINANCIACION'];
        if (hojaRefi) {
            await hojaRefi.loadHeaderRow(3); 
            const filas = await hojaRefi.getRows();
            const filasSocio = filas.filter(f => (f.get('CUIL') || '').toString().includes(dniStr));

            for (const f of filasSocio) {
                if (!nombreSocio) nombreSocio = this.formatearNombre((f.get('APELLIDO Y NOMBRE') || '').toString());
                
                const estado = (f.get('ESTADO') || '').toString().toUpperCase().trim();
                const rawDeuda = f.get('MONTO ACTUALIZADO'); 
                let deuda = this.parsearDinero(rawDeuda);
                
                if (deuda < 0) deuda = 0;

                if (deuda > 0 && !ESTADOS_IGNORAR_O_CANCELADO.includes(estado)) {
                    esMoroso = true;
                    procesadoEnRefi = true;
                    deudaTotal += deuda;
                }
            }
        }

        // REVISA HOJA CASHFLOW
        const hojaCashflow = this.doc.sheetsByTitle['CASHFLOW'];
        if (hojaCashflow) {
            await hojaCashflow.loadHeaderRow(2); 
            const filas = await hojaCashflow.getRows();
            const filasSocio = filas.filter(f => (f.get('CUIL') || '').toString().includes(dniStr));

            for (const f of filasSocio) {
                const apellido = f.get('APELLIDO') || '';
                const nombre = f.get('NOMBRE') || '';
                if (nombre || apellido) {
                    nombreSocio = this.formatearNombre(`${nombre} ${apellido}`);
                }

                const estado = (f.get('ESTADO') || '').toString().toUpperCase().trim();
                const rawDeuda = f.get('DEUDA');
                let deuda = this.parsearDinero(rawDeuda);

                if (rawDeuda === undefined || rawDeuda === null || rawDeuda === '') {
                    deuda = this.parsearDinero(f.get('MONTO'));
                }
                
                if (deuda < 0) deuda = 0;

                if (deuda > 0 && !ESTADOS_IGNORAR_O_CANCELADO.includes(estado)) {
                    if (ESTADOS_MORA.includes(estado)) {
                        if (!procesadoEnRefi) {
                            esMoroso = true;
                            deudaTotal += deuda;
                        }
                    } else {
                        esActivo = true;
                        deudaTotal += deuda;
                        
                        // Guarda los datos del ultimo credito activo que encuentre.
                        datosCreditoActivo = {
                            fecha: (f.get('FECHA') || '').toString(),
                            metodo: (f.get('METODO') || '').toString().trim(),
                            organismo: (f.get('ORGANISMO') || '').toString().trim(),
                            nroCredito: (f.get('NRO CREDITO') || '').toString(),
                            montoSacado: this.parsearDinero(f.get('MONTO')),
                            plazo: (f.get('PLAZO') || '').toString(),
                            cuotasPagas: (f.get('CTAS. PAGAS') || '0').toString(),
                            montoCuota: this.parsearDinero(f.get('MONTO_CTA'))
                        };
                    }
                }
            }
        }

        // EMPAQUETADO FINAL
        if (nombreSocio) {
            let estadoFinal: 'CASHFLOW' | 'REFINANCIACION' | 'AMBAS' = 'CASHFLOW';
            
            if (esMoroso) estadoFinal = 'REFINANCIACION';
            if (esMoroso && esActivo) estadoFinal = 'AMBAS';

            return {
                nombre: nombreSocio,
                dni: dniStr,
                deuda: deudaTotal, 
                hoja: estadoFinal,
                creditoActivo: datosCreditoActivo 
            };
        }

        return null;
    }
}



/* =======================================================================
    PREPARACION PARA MONGODB (NO-SQL)
   =======================================================================
   Instrucciones para el futuro:e
    Importar mongoose
    Cambiar la inicialización en app.ts
   ======================================================================= */

/*

const socioSchema = new mongoose.Schema({
    nombre: String,
    dni: String,
    deuda: Number,
    hoja: String, // 'CASHFLOW', 'REFINANCIACION', 'AMBAS'
    creditoActivo: {
        fecha: String,
        metodo: String,
        organismo: String,
        nroCredito: String,
        montoSacado: Number,
        plazo: String,
        cuotasPagas: String,
        montoCuota: Number
    }
});

const SocioModel = mongoose.model('Socio', socioSchema);

export class DatabaseManagerMongo {
    
    // Ya no necesitamos spreadsheetId.
    constructor() {}

    public async conectar(): Promise<void> {
        try {
            console.log('⏳ Conectando a MongoDB...');
            
            // ACA VA EL LINK DE CONEXION
            const URI_MONGODB = "CLAVE_DE_CONEXION";
            
            await mongoose.connect(URI_MONGODB);
            console.log('✅ Base de datos MongoDB conectada exitosamente.');
        } catch (error) {
            console.error('❌ Error al conectar a MongoDB:', error);
            throw error;
        }
    }

    public async buscarSocioTotal(dniABuscar: string): Promise<InfoSocio | null> {
        const dniStr = dniABuscar.trim();

        const socioEncontrado = await SocioModel.findOne({ dni: dniStr });

        if (socioEncontrado) {
            // Si lo encontró, lo devolvemos formateado.
            return {
                nombre: socioEncontrado.nombre,
                dni: socioEncontrado.dni,
                deuda: socioEncontrado.deuda,
                hoja: socioEncontrado.hoja as any,
                creditoActivo: socioEncontrado.creditoActivo
            };
        }

        // Si la base de datos devuelve vacío, es un Socio Nuevo
        return null;
    }
}
*/