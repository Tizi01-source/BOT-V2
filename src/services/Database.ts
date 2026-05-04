import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export interface InfoSocio {
    nombre: string;
    dni: string;
    deuda: number;
    hoja: 'CASHFLOW' | 'REFINANCIACION' | 'AMBAS';
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

    // Función auxiliar: Ahora REDONDEA y elimina los centavos
    private parsearDinero(valor: any): number {
        if (valor === undefined || valor === null || valor === '') return 0;
        if (typeof valor === 'number') return Math.round(valor); // 👈 Redondeamos directo
        
        let strVal = valor.toString().replace('$', '').replace(/\s/g, '');
        
        if (strVal.includes(',')) {
            strVal = strVal.replace(/\./g, '');
            strVal = strVal.replace(',', '.');
        } else if (strVal.split('.').length > 2) {
            strVal = strVal.replace(/\./g, '');
        }
        
        const numero = parseFloat(strVal);
        // 👈 Le aplicamos Math.round() para eliminar los decimales problemáticos
        return isNaN(numero) ? 0 : Math.round(numero); 
    }

    // Función auxiliar para poner Nombres Propios (ej: "PEREZ, JUAN" -> "Juan Perez")
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

        // 📝 DICCIONARIOS DE REGLAS DE NEGOCIO
        const ESTADOS_IGNORAR_O_CANCELADO = [
            'ANSES', 'FALLECIDO', 'CANCELADO', 'REFINANCIACION CANCELADO'
        ];
        
        const ESTADOS_MORA = [
            'SOTANO', 'REFINANCIACION V', 'REFINANCIACION', 'MOROSO', 
            'INCOBRABLE', 'ANALISIS MOV', 'SOTEIN', 
            'CONFINCRED', 'CONHER', 'DIAGRAMAS', 'MAGALI', 'MAYCOOP', 'TIZIANO'
        ];

        // 1. REVISAR REFINANCIACION
        const hojaRefi = this.doc.sheetsByTitle['REFINANCIACION'];
        if (hojaRefi) {
            await hojaRefi.loadHeaderRow(3); 
            const filas = await hojaRefi.getRows();
            const filasSocio = filas.filter(f => (f.get('CUIL') || '').toString().includes(dniStr));

            for (const f of filasSocio) {
                // Guardamos el nombre "por si acaso" no está en Cashflow
                if (!nombreSocio) nombreSocio = this.formatearNombre((f.get('APELLIDO Y NOMBRE') || '').toString());
                
                const estado = (f.get('ESTADO') || '').toString().toUpperCase().trim();
                
                // 👈 CAMBIO ACÁ: Tomamos directamente la columna MONTO ACTUALIZADO
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

        // 2. REVISAR CASHFLOW
        const hojaCashflow = this.doc.sheetsByTitle['CASHFLOW'];
        if (hojaCashflow) {
            await hojaCashflow.loadHeaderRow(2); 
            const filas = await hojaCashflow.getRows();
            const filasSocio = filas.filter(f => (f.get('CUIL') || '').toString().includes(dniStr));

            for (const f of filasSocio) {
                // 👈 CAMBIO ACÁ: Si lo encontramos en Cashflow, pisamos el nombre porque viene más prolijo
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
                    }
                }
            }
        }

        // 3. EMPAQUETADO FINAL
        if (nombreSocio) {
            let estadoFinal: 'CASHFLOW' | 'REFINANCIACION' | 'AMBAS' = 'CASHFLOW';
            
            if (esMoroso) estadoFinal = 'REFINANCIACION';
            if (esMoroso && esActivo) estadoFinal = 'AMBAS';

            return {
                nombre: nombreSocio,
                dni: dniStr,
                deuda: deudaTotal, 
                hoja: estadoFinal
            };
        }

        return null;
    }
}