import { buildAutoColumnMapping, suggestImportFieldForColumn } from './members-import-suggest';

describe('suggestImportFieldForColumn', () => {
  it('ignora columnas de metadato aunque las muestras parezcan calibre', () => {
    expect(suggestImportFieldForColumn('No. REGISTRO CLUB', ['200', '200', '200'])).toBe('ignore');
    expect(suggestImportFieldForColumn('CORTA', ['S', 'N', 'S'])).toBe('ignore');
    expect(suggestImportFieldForColumn('LARGA', ['S', 'N'])).toBe('ignore');
    expect(suggestImportFieldForColumn('No. REGISTRO SEDENA', ['12345', '67890'])).toBe('ignore');
  });

  it('vincula CALIBRE por encabezado o muestras reales', () => {
    expect(suggestImportFieldForColumn('CALIBRE', ['12 GA', '.223', '20 GA'])).toBe('weaponCaliber');
    expect(suggestImportFieldForColumn('Columna 9', ['.22', '.38', '9mm'])).toBe('weaponCaliber');
  });

  it('vincula MODELO por encabezado aunque las muestras parezcan tipo de arma', () => {
    expect(suggestImportFieldForColumn('MODELO', ['ESCOPETA', 'RIFLE', 'PISTOLA'])).toBe('weaponModel');
  });

  it('asigna weaponModel a la columna MODELO, no a CLASE', () => {
    const mapping = buildAutoColumnMapping([
      { header: 'CLASE', suggestedField: 'weaponPlatform' },
      { header: 'MODELO', suggestedField: 'weaponModel' },
      { header: 'MARCA', suggestedField: 'weaponBrand' },
    ]);
    expect(mapping['MODELO']).toBe('weaponModel');
    expect(mapping['MARCA']).toBe('weaponBrand');
  });
});