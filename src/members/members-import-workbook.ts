import * as XLSX from 'xlsx';

export function readImportWorkbook(buffer: Buffer): { workbook: XLSX.WorkBook } | { error: string } {
  if (!buffer?.length) {
    return { error: 'El archivo está vacío.' };
  }
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    if (!workbook.SheetNames.length) {
      return { error: 'El Excel no tiene hojas.' };
    }
    return { workbook };
  } catch {
    return {
      error:
        'No se pudo leer el archivo. Admitimos .xlsx y .xls (Excel 97–2003, p. ej. reportes del club). Si falla, ábrelo en Excel y guárdalo como .xlsx.',
    };
  }
}