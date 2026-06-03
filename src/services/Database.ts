import { GoogleSpreadsheet } from 'google-spreadsheet'; // Se importa la clase GoogleSpreadsheet para interactuar con Google Sheets.
import { JWT } from 'google-auth-library'; // Se importa JWT para autenticación con Google Sheets usando una cuenta de servicio.

// Se define la interfaz CreditoDetalle para representar los detalles de un crédito.
export interface CreditoDetalle {
    fecha: string;
    metodo: string;
    montoSacado: number;
    plazo: string;
    cuotasPagas: string;
    montoCuota: number;
    deuda: number;
    esActivo: boolean;
    esMora: boolean;
}

// Se define la interfaz InfoSocio para representar la información de un socio.
export interface InfoSocio {
    nombre: string;
    dni: string;
    estadoGlobal: 'CASHFLOW' | 'REFINANCIACION' | 'AMBAS' | 'CANCELADO';
    deudaTotal: number;
    cbu: CreditoDetalle | null;
    haberes: CreditoDetalle | null;
    tieneAmbos: boolean;
}

// Se define la clase DatabaseManager para manejar la conexión y consultas a Google Sheets.
export class DatabaseManager {
    private doc: GoogleSpreadsheet;

    constructor(spreadsheetId: string, clientEmail: string, privateKey: string) {
        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    }

    // Método para conectar a Google Sheets y cargar la información del documento.
    public async conectar(): Promise<void> {
        try {
            console.log('Conectando a la base de datos (Google Sheets)...');
            await this.doc.loadInfo();
            console.log(`Base de datos conectada: ${this.doc.title}`);
        } catch (error) {
            console.error('Error al conectar con Google Sheets:', error);
            throw error;
        }
    }

    // Método para buscar la información completa de un socio por su DNI.
    private parsearDinero(valor: any): number {
        if (!valor) return 0;
        if (typeof valor === 'number') return Math.round(valor);
        let strVal = valor.toString().replace('$', '').replace(/\s/g, '');
        if (strVal.includes(',') && strVal.includes('.')) {
            strVal = strVal.indexOf(',') > strVal.indexOf('.') 
                ? strVal.replace(/\./g, '').replace(',', '.') 
                : strVal.replace(/,/g, '');
        } else if (strVal.includes(',')) {
            strVal = strVal.replace(',', '.');
        } else if (strVal.split('.').length > 2) {
            strVal = strVal.replace(/\./g, '');
        }
        const numero = parseFloat(strVal);
        return isNaN(numero) ? 0 : Math.round(numero);
    }

    // Método para formatear el nombre del socio a partir de la información cruda.
    private formatearNombre(nombreCrudo: string): string {
        if (!nombreCrudo) return 'Socio';
        let partes = nombreCrudo.includes(',') ? nombreCrudo.split(',') : nombreCrudo.split(' ');
        if (nombreCrudo.includes(',')) partes = [partes[1], partes[0]]; 
        return partes.map(p => p.trim()).filter(p => p.length > 0).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }

    // Método para buscar la información completa de un socio por su DNI, incluyendo sus créditos activos y en mora.
    public async buscarSocioTotal(dniABuscar: string): Promise<InfoSocio | null> {
        // Se limpia el DNI de espacios y caracteres no numéricos para asegurar una búsqueda más precisa.
        const dniStr = dniABuscar.trim();
        
        // Se inicializan arrays para almacenar las filas que coincidan con el DNI en las hojas de Cashflow y Refinanciación.
        let coincidenCashflow: any[] = [];
        let coincidenRefi: any[] = [];

        // Se definen los estados que indican que un crédito debe ser ignorado o que está en mora, para luego filtrar las filas correspondientes.
        const ESTADOS_IGNORAR = ['ANSES', 'FALLECIDO', 'CANCELADO', 'REFINANCIACION CANCELADO'];
        const ESTADOS_MORA = ['REFINANCIACION V', 'REFINANCIACION', 'MOROSO', 'SOTANO', 'ANALISIS MOV', 'INCOBRABLE', 'CONHER', 'DIAGRAMAS', 'SOTEIN'];

        // Se accede a la hoja de Refinanciación y se cargan las filas para buscar coincidencias con el DNI.
        const hojaRefi = this.doc.sheetsByTitle['REFINANCIACION'];
        if (hojaRefi) {
            await hojaRefi.loadHeaderRow(3); 
            const filas = await hojaRefi.getRows();
            coincidenRefi = filas.filter(f => (f.get('CUIL') || '').toString().includes(dniStr));
        }

        // Se accede a la hoja de Cashflow y se cargan las filas para buscar coincidencias con el DNI.
        const hojaCashflow = this.doc.sheetsByTitle['CASHFLOW'];
        if (hojaCashflow) {
            await hojaCashflow.loadHeaderRow(2); 
            const filas = await hojaCashflow.getRows();
            coincidenCashflow = filas.filter(f => (f.get('CUIL') || '').toString().includes(dniStr));
        }

        // Si no se encuentran coincidencias en ninguna de las hojas, se devuelve null indicando que el socio es nuevo o no tiene créditos registrados.
        if (coincidenCashflow.length === 0 && coincidenRefi.length === 0) return null;

        // Se determina el nombre del socio a partir de las filas encontradas, dando prioridad a la información de Cashflow.
        let nombreSocio = 'Socio';
        if (coincidenCashflow.length > 0) nombreSocio = this.formatearNombre(`${coincidenCashflow[0].get('NOMBRE')} ${coincidenCashflow[0].get('APELLIDO')}`);
        else if (coincidenRefi.length > 0) nombreSocio = this.formatearNombre(coincidenRefi[0].get('APELLIDO Y NOMBRE'));

        // Se procesan las filas encontradas para determinar los detalles de los créditos del socio, su estado global y la deuda total.
        let cbu: CreditoDetalle | null = null;
        let haberes: CreditoDetalle | null = null;

        // Función auxiliar para procesar las filas de una hoja y extraer los detalles de los créditos, actualizando el estado global y la deuda total del socio.
        const procesarFilas = (filas: any[], esRefi: boolean) => {
            for (const f of filas) {
                const estado = (f.get('ESTADO') || '').toString().toUpperCase().trim();
                const metodo = (f.get('METODO') || '').toString().toUpperCase().trim();
                
                if (ESTADOS_IGNORAR.includes(estado)) continue;

                let deuda = this.parsearDinero(esRefi ? f.get('MONTO ACTUALIZADO') : (f.get('DEUDA') || f.get('MONTO')));
                if (deuda < 0) deuda = 0;

                const esMora = esRefi || ESTADOS_MORA.includes(estado);
                const esActivo = !esMora && estado === 'ACTIVO';
                
                if (deuda === 0 && !esActivo) continue;

                const credito: CreditoDetalle = {
                    fecha: (f.get('FECHA') || '').toString(),
                    metodo: metodo,
                    montoSacado: this.parsearDinero(f.get('MONTO')),
                    plazo: (f.get('PLAZO') || '0').toString(),
                    cuotasPagas: (esRefi ? f.get('CTAS PAGAS') : f.get('CTAS. PAGAS') || '0').toString(),
                    montoCuota: this.parsearDinero(f.get('MONTO_CTA')),
                    deuda: deuda,
                    esActivo: esActivo,
                    esMora: esMora
                };

                const esMetodoHaberes = metodo.includes('HABERES') || metodo.includes('AMPEAL');
                
                if (esMetodoHaberes) {
                    if (!haberes || credito.esMora || credito.esActivo) haberes = credito;
                } else {
                    if (!cbu || credito.esMora || credito.esActivo) cbu = credito;
                }
            }
        };

        procesarFilas(coincidenCashflow, false);
        procesarFilas(coincidenRefi, true);

        // Se formatean los detalles de los créditos y se calcula el estado global y la deuda total del socio para devolver la información completa.
        const cbuFinal = cbu as CreditoDetalle | null;
        const haberesFinal = haberes as CreditoDetalle | null;

        // Se calcula la deuda total sumando las deudas de ambos créditos si están en mora, y se determina el estado global del socio según el estado de sus créditos.
        const deudaCbu = cbuFinal?.esMora === true ? (cbuFinal.deuda || 0) : 0;
        const deudaHaberes = haberesFinal?.esMora === true ? (haberesFinal.deuda || 0) : 0;
        const deudaTotal = deudaCbu + deudaHaberes;
        
        let estadoGlobal: 'CASHFLOW' | 'REFINANCIACION' | 'AMBAS' | 'CANCELADO' = 'CANCELADO';
        
        // Se determina el estado global del socio según el estado de sus créditos, dando prioridad a la información de mora sobre la de activo.
        if (cbuFinal?.esMora === true || haberesFinal?.esMora === true) {
            estadoGlobal = 'REFINANCIACION';
        } else if (cbuFinal?.esActivo === true || haberesFinal?.esActivo === true) {
            estadoGlobal = 'CASHFLOW';
        }

        if ((cbuFinal?.esMora === true && haberesFinal?.esMora === true) || 
            (cbuFinal?.esActivo === true && haberesFinal?.esActivo === true)) {
            estadoGlobal = 'AMBAS';
        }

        return {
            nombre: nombreSocio,
            dni: dniStr,
            estadoGlobal,
            deudaTotal,
            cbu: cbuFinal,
            haberes: haberesFinal,
            tieneAmbos: cbuFinal !== null && haberesFinal !== null
        };
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