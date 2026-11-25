import { finalizeImportAddress, groupMemberImportRows } from './members-import-grouping';
import { enrichInlineWeaponSlot, extractInlineWeaponsFromRow } from './members-import-weapons-inline';

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
    expect(members[0].address).toContain('CP:28030');
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
    expect(members[0].address).toBe('CALLE HIDALGO 12 COL. LAS FLORES, COLIMA CP:28030');
  });
});

describe('groupMemberImportRows weapons', () => {
  const baseMember = {
    NUMERO_SOCIO: '0155',
    NOMBRE: 'CARLOS RAMIREZ SOTO',
    CURP: 'RASC800101HCLMRR09',
    TIPO_MEMBRESIA: 'ordinario',
  };

  it('conserva las 5 armas de filas consecutivas del mismo socio', () => {
    const weapons = [
      { MARCA: 'BROWNING', MODELO: 'HP', CALIBRE: '9 MM', SERIE: '446755', PLATAFORMA: 'PISTOLA' },
      { MARCA: 'LLAMA', MODELO: 'III', CALIBRE: '380', SERIE: '263155', PLATAFORMA: 'PISTOLA' },
      { MARCA: 'GLOCK', MODELO: '17', CALIBRE: '9 MM', SERIE: 'BZLY637', PLATAFORMA: 'PISTOLA' },
      { MARCA: 'MOSSBERG', MODELO: '500', CALIBRE: '12', SERIE: 'K866579', PLATAFORMA: 'ESCOPETA' },
      { MARCA: 'MARLIN', MODELO: '60', CALIBRE: '22', SERIE: 'MM88302D', PLATAFORMA: 'RIFLE' },
    ];
    const errors: string[] = [];
    const members = groupMemberImportRows(
      weapons.map((weapon, index) => ({
        ...baseMember,
        ...(index === 0 ? {} : { NOMBRE: '', CURP: '' }),
        ...weapon,
      })),
      0,
      errors,
    );

    expect(errors).toEqual([]);
    expect(members).toHaveLength(1);
    expect(members[0].inlineWeapons).toHaveLength(5);
    expect(members[0].inlineWeapons.map((w) => w.serialNumber)).toEqual([
      '446755',
      '263155',
      'BZLY637',
      'K866579',
      'MM88302D',
    ]);
  });

  it('une armas del mismo socio aunque no estén en filas consecutivas', () => {
    const errors: string[] = [];
    const members = groupMemberImportRows(
      [
        {
          ...baseMember,
          MARCA: 'BROWNING',
          MODELO: 'HP',
          CALIBRE: '9 MM',
          SERIE: '446755',
        },
        {
          NUMERO_SOCIO: '0200',
          NOMBRE: 'OTRO SOCIO PRUEBA',
          CURP: 'OUSP900202MCLRRN08',
          MARCA: 'CZ',
          MODELO: '75',
          CALIBRE: '9mm',
          SERIE: 'OTHER1',
        },
        {
          ...baseMember,
          MARCA: 'MOSSBERG',
          MODELO: '500',
          CALIBRE: '12',
          SERIE: 'K866579',
        },
        {
          ...baseMember,
          MARCA: 'MARLIN',
          MODELO: '60',
          CALIBRE: '22',
          SERIE: 'MM88302D',
        },
      ],
      0,
      errors,
    );

    expect(errors).toEqual([]);
    expect(members).toHaveLength(2);
    const socio155 = members.find((row) => row.memberNumber === '0155');
    expect(socio155?.inlineWeapons).toHaveLength(3);
    expect(socio155?.inlineWeapons.map((w) => w.serialNumber).sort()).toEqual([
      '446755',
      'K866579',
      'MM88302D',
    ]);
  });
});

describe('enrichInlineWeaponSlot', () => {
  it('desempaqueta «PISTOLA - BROWNING - 446755» y completa modelo faltante', () => {
    const enriched = enrichInlineWeaponSlot({
      index: 1,
      brand: 'PISTOLA - BROWNING - 446755',
      caliber: '9 MM - 122 - 30/03/2026',
    });
    expect(enriched.platformRaw?.toLowerCase()).toContain('pistola');
    expect(enriched.brand).toBe('BROWNING');
    expect(enriched.serialNumber).toBe('446755');
    expect(enriched.caliber).toBe('9 MM');
    expect(enriched.model).toBe('S/M');
  });

  it('extrae armas de fila con descripcion empacada', () => {
    const slots = extractInlineWeaponsFromRow({
      MARCA: 'PISTOLA - GLOCK - BZLY637',
      CALIBRE: '9 MM',
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].brand).toBe('GLOCK');
    expect(slots[0].serialNumber).toBe('BZLY637');
    expect(slots[0].model).toBe('S/M');
    expect(slots[0].caliber).toBe('9 MM');
  });

  it('lee MATRICULA y CLASE DEL ARMA del padrón Coliman', () => {
    const slots = extractInlineWeaponsFromRow({
      'CLASE DEL ARMA': 'PISTOLA',
      CALIBRE: '.22" L.R.',
      MARCA: 'GRAND POWER',
      MODELO: 'K22',
      MATRICULA: 'K103118',
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      platformRaw: 'PISTOLA',
      brand: 'GRAND POWER',
      model: 'K22',
      caliber: '.22" L.R.',
      serialNumber: 'K103118',
    });
  });
});

describe('finalizeImportAddress', () => {
  it('elimina COLIMA/CP duplicados del padrón Coliman', () => {
    expect(
      finalizeImportAddress(
        'JOSE AHUMADA SALAZAR 158 ALFREDO V BONFIL VILLA DE ALVAREZ COLIMA CP:28978',
      ),
    ).toBe('JOSE AHUMADA SALAZAR 158 ALFREDO V BONFIL VILLA DE ALVAREZ, COLIMA CP:28978');
    expect(
      finalizeImportAddress(
        'JARDINES RESIDENCIALES COLIMA COLIMA CP:28030 COLIMA CP:28978',
      ),
    ).toBe('JARDINES RESIDENCIALES, COLIMA CP:28978');
    expect(
      finalizeImportAddress(
        'PASEO DE LAS GOLONDRINAS 560 JARDINES RESIDENCIALES COLIMA COLIMA CP:28030',
      ),
    ).toBe('PASEO DE LAS GOLONDRINAS 560 JARDINES RESIDENCIALES, COLIMA CP:28030');
  });
});
