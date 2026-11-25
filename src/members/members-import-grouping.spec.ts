import { groupMemberImportRows } from './members-import-grouping';

describe('groupMemberImportRows address merge', () => {
  it('no pisa la dirección completa con DIRECCION_3 de filas posteriores del mismo socio', () => {
    const errors: string[] = [];
    const members = groupMemberImportRows(
      [
        {
          NUMERO_SOCIO: '42',
          NOMBRE: 'JUAN PEREZ LOPEZ',
          CURP: 'PELJ850101HCLRRN09',
          DIRECCION: 'AV. REFORMA 100',
          DIRECCION_2: 'COL. CENTRO',
          DIRECCION_3: 'COLIMA COL. CP.28030',
          MARCA: 'GLOCK',
          MODELO: '17',
          CALIBRE: '9mm',
          SERIE: 'ABC123',
        },
        {
          NUMERO_SOCIO: '',
          NOMBRE: '',
          CURP: '',
          DIRECCION: '',
          DIRECCION_2: '',
          DIRECCION_3: 'COLIMA COL. CP.28030',
          MARCA: 'CZ',
          MODELO: '75',
          CALIBRE: '9mm',
          SERIE: 'XYZ789',
        },
      ],
      0,
      errors,
    );

    expect(errors).toEqual([]);
    expect(members).toHaveLength(1);
    expect(members[0].address).toContain('AV. REFORMA 100');
    expect(members[0].address).toContain('COL. CENTRO');
    expect(members[0].address).toContain('COLIMA COL. CP.28030');
    expect(members[0].address).not.toBe('COLIMA COL. CP.28030');
    expect(members[0].inlineWeapons).toHaveLength(2);
  });

  it('une fragmentos de dirección repartidos en varias filas del mismo socio', () => {
    const errors: string[] = [];
    const members = groupMemberImportRows(
      [
        {
          NUMERO_SOCIO: '7',
          NOMBRE: 'ANA GARCIA RUIZ',
          CURP: 'GARA900202MCLRRN01',
          DIRECCION: 'CALLE HIDALGO 12',
          DIRECCION_2: '',
          DIRECCION_3: '',
        },
        {
          NUMERO_SOCIO: '',
          NOMBRE: '',
          CURP: '',
          DIRECCION: '',
          DIRECCION_2: 'COL. LAS FLORES',
          DIRECCION_3: '',
        },
        {
          NUMERO_SOCIO: '',
          NOMBRE: '',
          CURP: '',
          DIRECCION: '',
          DIRECCION_2: '',
          DIRECCION_3: 'COLIMA COL. CP.28030',
        },
      ],
      0,
      errors,
    );

    expect(errors).toEqual([]);
    expect(members).toHaveLength(1);
    expect(members[0].address).toBe('CALLE HIDALGO 12 COL. LAS FLORES COLIMA COL. CP.28030');
  });
});
