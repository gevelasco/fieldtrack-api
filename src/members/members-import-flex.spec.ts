import { mapMemberRow } from './members-import-flex';
import { matchMemberFieldFromHeader } from './members-import-header-match';

describe('mapMemberRow address parts', () => {
  it('concatena DIRECCION, DIRECCION_2 y DIRECCION_3 en fullAddress', () => {
    expect(matchMemberFieldFromHeader('DIRECCION')).toBe('fullAddress');
    expect(matchMemberFieldFromHeader('DIRECCION_2')).toBe('fullAddress');
    expect(matchMemberFieldFromHeader('DIRECCION_3')).toBe('fullAddress');

    const mapped = mapMemberRow({
      DIRECCION: 'AV. REFORMA 100',
      DIRECCION_2: 'COL. CENTRO',
      DIRECCION_3: 'COLIMA CP:28000',
      NOMBRE: 'JUAN PEREZ',
    });

    expect(mapped.fullAddress).toBe('AV. REFORMA 100 COL. CENTRO COLIMA CP:28000');
  });

  it('respeta el mapeo manual de varias columnas a fullAddress', () => {
    const mapped = mapMemberRow(
      {
        Calle: 'Calle 1',
        Extra: 'Depto 2',
        Colonia: 'Guadalajarita',
      },
      {
        Calle: 'fullAddress',
        Extra: 'fullAddress',
        Colonia: 'colony',
      },
    );
    expect(mapped.fullAddress).toBe('Calle 1 Depto 2');
    expect(mapped.colony).toBe('Guadalajarita');
  });
});
