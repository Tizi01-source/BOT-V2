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

    // Función auxiliar para arreglar los números con comas y signos $ del Excel
    private parsearDinero(valor: string | number | undefined): number {
        if (!valor) return 0;
        if (typeof valor === 'number') return valor;
        
        // Convertimos a string, sacamos signos $, espacios, y cambiamos comas por puntos
        let limpio = valor.toString().replace('$', '').replace(/\s/g, '').replace(',', '.');
        const numero = parseFloat(limpio);
        return isNaN(numero) ? 0 : numero;
    }

    // Función auxiliar para poner Nombres Propios (ej: "PEREZ, JUAN" -> "Juan Perez")
    private formatearNombre(nombreCrudo: string): string {
        if (!nombreCrudo) return 'Socio';
        
        // Si viene "APELLIDO, NOMBRE" de Refi
        let partes = nombreCrudo.includes(',') ? nombreCrudo.split(',') : nombreCrudo.split(' ');
        
        // Invertimos si vino con coma (para que quede Nombre Apellido) y capitalizamos
        if (nombreCrudo.includes(',')) {
            partes = [partes[1], partes[0]]; 
        }

        return partes
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
            .join(' ');
    }

    public async buscarSocioTotal(dniABuscar: string): Promise<InfoSocio | null> {
        const dniStr = dniABuscar.trim();
        let socioEncontrado: InfoSocio | null = null;

        // 1. Buscar en CASHFLOW primero (Cuenta principal)
        const hojaCashflow = this.doc.sheetsByTitle['CASHFLOW'];
        if (hojaCashflow) {
            await hojaCashflow.loadHeaderRow(2); 
            const filas = await hojaCashflow.getRows();
            
            const encontrada = filas.find(f => {
                const cuil = f.get('CUIL')?.toString() || '';
                return cuil.includes(dniStr);
            });

            if (encontrada) {
                const apellido = encontrada.get('APELLIDO') || '';
                const nombre = encontrada.get('NOMBRE') || '';
                const nombreCompleto = this.formatearNombre(`${nombre} ${apellido}`);
                
                // Usamos la columna DEUDA si existe, sino MONTO
                let deudaCashflow = this.parsearDinero(encontrada.get('DEUDA'));
                if (deudaCashflow === 0) deudaCashflow = this.parsearDinero(encontrada.get('MONTO'));

                socioEncontrado = {
                    nombre: nombreCompleto,
                    dni: dniStr,
                    deuda: deudaCashflow,
                    hoja: 'CASHFLOW'
                };
            }
        }

        // 2. Buscar en REFINANCIACION
        const hojaRefi = this.doc.sheetsByTitle['REFINANCIACION'];
        if (hojaRefi) {
            await hojaRefi.loadHeaderRow(3); 
            const filas = await hojaRefi.getRows();
            
            const encontrada = filas.find(f => {
                const cuil = f.get('CUIL')?.toString() || '';
                return cuil.includes(dniStr);
            });

            if (encontrada) {
                const nombreCompleto = this.formatearNombre(encontrada.get('APELLIDO Y NOMBRE') || '');
                const deudaRefi = this.parsearDinero(encontrada.get('MONTO ACTUALIZADO'));

                if (socioEncontrado) {
                    // Si ya estaba en Cashflow, le SUMAMOS la deuda de Refi y cambiamos el estado
                    socioEncontrado.deuda += deudaRefi;
                    socioEncontrado.hoja = 'AMBAS'; // Marcamos que tiene problemas en ambas
                } else {
                    // Si solo estaba en Refi
                    socioEncontrado = {
                        nombre: nombreCompleto,
                        dni: dniStr,
                        deuda: deudaRefi,
                        hoja: 'REFINANCIACION'
                    };
                }
            }
        }

        return socioEncontrado;
    }
}