/**
 * Servicio para exportación de registros y compartir por WhatsApp
 */

import { WeighingRecord } from '../types';

export interface ExportOptions {
    format: 'csv' | 'json';
    includePhotos?: boolean;
    dateRange?: { from: Date; to: Date };
}

/**
 * Exporta registros a CSV
 */
export function exportToCSV(records: WeighingRecord[]): string {
    const headers = [
        'ID',
        'Fecha/Hora',
        'Proveedor',
        'Producto',
        'Lote',
        'Peso Bruto (kg)',
        'Peso Nota (kg)',
        'Peso Neto (kg)',
        'Tara Total (kg)',
        'Cantidad Cajas',
        'Tara Unitaria (kg)',
        'Cantidad Embalaje',
        'Tara Embalaje (kg)',
        'Temperatura (°C)',
        'Temperatura Sugerida (°C)',
        'Fecha Fabricación',
        'Fecha Vencimiento',
        'Estado',
        'Información Extraída',
        'Análisis IA',
    ];

    const rows = records.map((r) => [
        r.id,
        new Date(r.timestamp).toLocaleString('es-AR'),
        r.supplier,
        r.product,
        r.batch || '',
        r.grossWeight.toFixed(2),
        r.noteWeight.toFixed(2),
        r.netWeight.toFixed(2),
        r.taraTotal.toFixed(2),
        r.boxes?.qty || '',
        r.boxes?.unitTara?.toFixed(3) || '',
        r.taraEmbalaje?.qty || '',
        r.taraEmbalaje?.unitTara?.toFixed(3) || '',
        r.temperature || '',
        r.temperatureSuggestion || '',
        r.productionDate || '',
        r.expirationDate || '',
        r.status,
        r.extractedPhotoInfo || '',
        r.aiAnalysis || '',
    ]);

    // Escape CSV values
    const escapedRows = rows.map((row) =>
        row.map((cell) => {
            const str = String(cell || '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        })
    );

    const csv = [
        headers.join(','),
        ...escapedRows.map((row) => row.join(',')),
    ].join('\n');

    return csv;
}

/**
 * Descarga CSV como archivo
 */
export function downloadCSV(records: WeighingRecord[], filename: string = 'conferente-pro.csv'): void {
    const csv = exportToCSV(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}

/**
 * Genera un reporte formateado para WhatsApp
 */
export function generateWhatsAppReport(record: WeighingRecord): string {
    const date = new Date(record.timestamp).toLocaleString('es-AR');
    const netDiff = Math.abs(record.grossWeight - record.noteWeight - record.netWeight);
    const status = netDiff <= 0.2 ? '✅ VÁLIDO' : '⚠️ REVISIÓN';

    let report = `*REPORTE DE PESAJE - CONFERENTE PRO*\n\n`;
    report += `📋 *INFORMACIÓN GENERAL*\n`;
    report += `Fecha: ${date}\n`;
    report += `Proveedor: ${record.supplier}\n`;
    report += `Producto: ${record.product}\n\n`;

    if (record.batch) {
        report += `📦 *DETALLES DEL LOTE*\n`;
        report += `Lote: ${record.batch}\n`;
        if (record.productionDate) report += `Fabricación: ${record.productionDate}\n`;
        if (record.expirationDate) report += `Vencimiento: ${record.expirationDate}\n\n`;
    }

    report += `⚖️ *PESOS (kg)*\n`;
    report += `Bruto: ${record.grossWeight.toFixed(2)}\n`;
    report += `Nota Fiscal: ${record.noteWeight.toFixed(2)}\n`;
    report += `Neto: ${record.netWeight.toFixed(2)}\n`;
    report += `Tara Total: ${record.taraTotal.toFixed(2)}\n`;
    report += `${status}\n\n`;

    if (record.boxes?.qty && record.boxes?.unitTara) {
        report += `📊 *COMPOSICIÓN*\n`;
        report += `Cajas: ${record.boxes.qty} × ${record.boxes.unitTara.toFixed(3)}kg\n`;
        if (record.taraEmbalaje?.qty && record.taraEmbalaje?.unitTara) {
            report += `Embalaje: ${record.taraEmbalaje.qty} × ${record.taraEmbalaje.unitTara.toFixed(3)}kg\n`;
        }
        report += '\n';
    }

    if (record.temperature || record.temperatureSuggestion) {
        report += `🌡️ *TEMPERATURA*\n`;
        if (record.temperature) report += `Ingresada: ${record.temperature}°C\n`;
        if (record.temperatureSuggestion) report += `Sugerida: ${record.temperatureSuggestion}°C\n\n`;
    }

    if (record.extractedPhotoInfo) {
        report += `📸 *INFORMACIÓN EXTRAÍDA*\n`;
        report += `${record.extractedPhotoInfo}\n\n`;
    }

    if (record.aiAnalysis) {
        report += `🤖 *ANÁLISIS IA*\n`;
        report += `${record.aiAnalysis}\n\n`;
    }

    report += `_Generado por Conferente Pro_`;

    return report;
}

/**
 * Abre WhatsApp con reporte pre-redactado
 */
export function shareToWhatsApp(record: WeighingRecord, phoneNumber: string): void {
    const report = generateWhatsAppReport(record);
    const encodedMessage = encodeURIComponent(report);
    const url = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(url, '_blank');
}

/**
 * Abre WhatsApp con múltiples registros resumidos
 */
export function shareMultipleToWhatsApp(records: WeighingRecord[], phoneNumber: string): void {
    let report = `*RESUMEN DIARIO - CONFERENTE PRO*\n\n`;
    report += `Registros: ${records.length}\n`;
    report += `Período: ${new Date(records[0].timestamp).toLocaleDateString('es-AR')} a ${new Date(records[records.length - 1].timestamp).toLocaleDateString('es-AR')}\n\n`;

    const bySupplier = records.reduce(
        (acc, r) => {
            acc[r.supplier] = (acc[r.supplier] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    report += `*Por Proveedor:*\n`;
    Object.entries(bySupplier).forEach(([supplier, count]) => {
        report += `${supplier}: ${count}\n`;
    });

    const encodedMessage = encodeURIComponent(report);
    const url = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(url, '_blank');
}

/**
 * Genera estadísticas para reporte
 */
export function generateStatistics(records: WeighingRecord[]) {
    if (records.length === 0) {
        return {
            total: 0,
            validCount: 0,
            errorCount: 0,
            averageNetWeight: 0,
            averageTara: 0,
        };
    }

    const validCount = records.filter((r) => r.status === 'verified').length;
    const errorCount = records.filter((r) => r.status === 'error').length;
    const averageNetWeight = records.reduce((sum, r) => sum + r.netWeight, 0) / records.length;
    const averageTara = records.reduce((sum, r) => sum + r.taraTotal, 0) / records.length;

    return {
        total: records.length,
        validCount,
        errorCount,
        validPercentage: ((validCount / records.length) * 100).toFixed(1),
        averageNetWeight: averageNetWeight.toFixed(2),
        averageTara: averageTara.toFixed(2),
    };
}
