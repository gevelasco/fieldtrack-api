import * as fs from 'fs';
import { parseMembersImportFile } from './members-import.parser';

const COLIMAN_XLS = '/Users/germanvelasco/Downloads/REPORTE SOCIOS COLIMAN.xls';

describe('import padrón Coliman real', () => {
  const hasFile = fs.existsSync(COLIMAN_XLS);

  (hasFile ? it : it.skip)('socio 155 conserva 5 armas con matrícula y dirección limpia', () => {
    const buffer = fs.readFileSync(COLIMAN_XLS);
    const { members, parseErrors } = parseMembersImportFile(buffer);
    expect(parseErrors.filter((e) => e.includes('155'))).toEqual([]);

    const member = members.find((row) => String(row.memberNumber).replace(/^0+/, '') === '155');
    expect(member).toBeTruthy();
    expect(member!.inlineWeapons).toHaveLength(5);
    expect(member!.inlineWeapons.map((w) => w.serialNumber)).toEqual([
      'K103118',
      'FP44254',
      '73A198769',
      'PT04023 YV31A',
      'JP20413YX242',
    ]);
    expect(member!.address).toBe(
      'JOSE AHUMADA SALAZAR 158 ALFREDO V BONFIL VILLA DE ALVAREZ, COLIMA CP:28978',
    );
    expect(member!.address).not.toContain('28030');
    expect(member!.address).not.toMatch(/COLIMA\s+COLIMA/i);
  });
});
