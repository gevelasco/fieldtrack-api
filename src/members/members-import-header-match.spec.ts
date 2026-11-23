import {
  matchImportFieldFromHeader,
  matchMemberFieldFromHeader,
  matchWeaponFieldFromHeader,
} from './members-import-header-match';

describe('members-import-header-match', () => {
  const coliman: Array<[string, string]> = [
    ['No. REGISTRO CLUB', 'ignore'],
    ['DIRECCION DEL CLUB', 'ignore'],
    ['NOMBRE DEL SOCIO', 'fullName'],
    ['CURP', 'curp'],
    ['NO. SOCIO', 'memberNumber'],
    ['DIRECCION DEL SOCIO', 'fullAddress'],
  ];

  it.each(coliman)('Coliman %p → %p', (header, expected) => {
    expect(matchImportFieldFromHeader(header)).toBe(expected);
  });

  it('acepta variantes de encabezado sin coincidencia exacta', () => {
    expect(matchMemberFieldFromHeader('Num Socio')).toBe('memberNumber');
    expect(matchMemberFieldFromHeader('NUMERO DE SOCIO')).toBe('memberNumber');
    expect(matchMemberFieldFromHeader('Nombre completo integrante')).toBe('fullName');
    expect(matchMemberFieldFromHeader('Domicilio socio')).toBe('fullAddress');
    expect(matchMemberFieldFromHeader('C.P.')).toBe('zip');
    expect(matchMemberFieldFromHeader('CURP')).toBe('curp');
  });

  it('vincula columnas de armas por palabras clave', () => {
    expect(matchWeaponFieldFromHeader('MARCA DEL ARMA')).toBe('weaponBrand');
    expect(matchWeaponFieldFromHeader('CALIBRE')).toBe('weaponCaliber');
    expect(matchWeaponFieldFromHeader('CLASE DEL ARMA')).toBe('weaponPlatform');
    expect(matchWeaponFieldFromHeader('MODELO')).toBe('weaponModel');
    expect(matchWeaponFieldFromHeader('MATRICULA')).toBe('weaponSerial');
    expect(matchWeaponFieldFromHeader('No. DE SERIE')).toBe('weaponSerial');
  });
});