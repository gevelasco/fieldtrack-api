import { normalizeCurpImport } from './members-import-grouping';

describe('normalizeCurpImport', () => {
  it('extrae CURP de celdas con texto extra', () => {
    expect(normalizeCurpImport('BICE490928HCMRSN03 OMO FK4')).toBe('BICE490928HCMRSN03');
    expect(normalizeCurpImport('DUTH590319HCMXNC03   OMO CLAVE T37')).toBe('DUTH590319HCMXNC03');
  });

  it('acepta CURP limpia', () => {
    expect(normalizeCurpImport('baga741207hcmrdb02')).toBe('BAGA741207HCMRDB02');
  });

  it('rechaza CURP incompleta', () => {
    expect(normalizeCurpImport('ROMR841207HMNDGB')).toBeNull();
  });
});