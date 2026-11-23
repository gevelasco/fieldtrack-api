import { type ImportFieldId } from './members-import-field-ids';
import { normalizeKey } from './members-import-keys';

type HeaderFieldRule = {
  field: ImportFieldId;
  /** Cada grupo exige que todas sus palabras aparezcan en el encabezado. */
  allOf?: string[][];
  /** Basta con que aparezca una de estas palabras o frases. */
  anyOf?: string[];
  /** Si aparece alguna, esta regla no aplica. */
  noneOf?: string[];
  priority?: number;
};

function tokenizeHeaderKey(key: string): Set<string> {
  const tokens = new Set<string>();
  for (const part of key.split('_')) {
    const p = part.trim();
    if (p) {
      tokens.add(p);
    }
  }
  return tokens;
}

function matchesTerm(key: string, tokens: Set<string>, term: string): boolean {
  if (!term) {
    return false;
  }
  if (tokens.has(term)) {
    return true;
  }
  if (term.length <= 3) {
    return new RegExp(`(^|_)${term}(_|$)`).test(key);
  }
  if (key.includes(term)) {
    return true;
  }
  const compactKey = key.replace(/_/g, '');
  const compactTerm = term.replace(/_/g, '');
  return compactTerm.length >= 4 && compactKey.includes(compactTerm);
}

/** Palabra o frase (con _) por tokens o subcadenas (palabras cortas solo como token). */
function headerIncludes(key: string, tokens: Set<string>, phrase: string): boolean {
  const normalizedPhrase = normalizeKey(phrase);
  if (!normalizedPhrase) {
    return false;
  }
  const parts = normalizedPhrase.split('_').filter(Boolean);
  if (!parts.length) {
    return false;
  }
  return parts.every((part) => matchesTerm(key, tokens, part));
}

function ruleApplies(rule: HeaderFieldRule, key: string, tokens: Set<string>): boolean {
  if (rule.noneOf?.some((term) => headerIncludes(key, tokens, term))) {
    return false;
  }
  if (rule.allOf?.length) {
    return rule.allOf.every((group) => group.every((term) => headerIncludes(key, tokens, term)));
  }
  if (rule.anyOf?.length) {
    return rule.anyOf.some((term) => headerIncludes(key, tokens, term));
  }
  return false;
}

function scoreRule(rule: HeaderFieldRule, key: string, tokens: Set<string>): number {
  if (!ruleApplies(rule, key, tokens)) {
    return 0;
  }
  let score = rule.priority ?? 5;
  if (rule.anyOf?.length) {
    score += rule.anyOf.filter((term) => headerIncludes(key, tokens, term)).length * 0.35;
  }
  if (rule.allOf?.length) {
    const groups = rule.allOf.reduce((n, g) => n + g.length, 0);
    score += groups * 0.25;
  }
  return score;
}

function pickBestField(rules: HeaderFieldRule[], key: string, tokens: Set<string>): ImportFieldId | null {
  let best: { field: ImportFieldId; score: number } | null = null;
  for (const rule of rules) {
    const score = scoreRule(rule, key, tokens);
    if (score <= 0) {
      continue;
    }
    if (!best || score > best.score) {
      best = { field: rule.field, score };
    }
  }
  return best?.field ?? null;
}

/** Columnas del club / metadatos que no se importan. */
export function isIgnoredHeaderByKeywords(header: string): boolean {
  const key = normalizeKey(header);
  if (!key) {
    return false;
  }
  const tokens = tokenizeHeaderKey(key);
  const clubScoped =
    headerIncludes(key, tokens, 'club') &&
    (headerIncludes(key, tokens, 'registro') ||
      headerIncludes(key, tokens, 'direccion') ||
      headerIncludes(key, tokens, 'domicilio') ||
      headerIncludes(key, tokens, 'no'));
  if (clubScoped) {
    return true;
  }
  if (headerIncludes(key, tokens, 'folio') && !headerIncludes(key, tokens, 'socio')) {
    return true;
  }
  if (tokens.has('corta') || tokens.has('larga')) {
    return true;
  }
  if (
    headerIncludes(key, tokens, 'registro') &&
    (headerIncludes(key, tokens, 'sedena') || headerIncludes(key, tokens, 'club'))
  ) {
    return true;
  }
  if (key === 'no' || key === 'num') {
    return true;
  }
  return false;
}

const MEMBER_HEADER_RULES: HeaderFieldRule[] = [
  { field: 'memberNumber', anyOf: ['no_socio', 'num_socio', 'numero_socio', 'nro_socio', 'clave_socio'], priority: 20 },
  { field: 'memberNumber', allOf: [['numero'], ['socio']], noneOf: ['club', 'arma', 'membresia'], priority: 18 },
  { field: 'memberNumber', allOf: [['num'], ['socio']], noneOf: ['club', 'arma', 'membresia', 'nombre'], priority: 17 },
  { field: 'memberNumber', allOf: [['no'], ['socio']], noneOf: ['club', 'arma', 'membresia', 'nombre', 'registro'], priority: 17 },
  { field: 'memberNumber', anyOf: ['numero', 'nro', 'clave', 'id_socio', 'idsocio'], noneOf: ['club', 'arma', 'membresia', 'nombre', 'direccion', 'domicilio', 'curp', 'rfc', 'serie'], priority: 8 },

  { field: 'curp', anyOf: ['curp', 'clave_unica', 'claveunica'], priority: 25 },
  { field: 'rfc', anyOf: ['rfc'], priority: 24 },

  { field: 'fullName', allOf: [['nombre'], ['socio']], noneOf: ['club', 'numero', 'direccion', 'domicilio'], priority: 16 },
  { field: 'fullName', anyOf: ['nombre', 'nombres', 'name', 'integrante', 'titular', 'razon_social'], noneOf: ['club', 'numero', 'num', 'no_socio', 'direccion', 'domicilio', 'curp', 'arma', 'marca', 'modelo', 'calibre', 'serie'], priority: 12 },
  { field: 'fullName', anyOf: ['nombre_completo', 'nombre_y_apellidos'], priority: 14 },

  { field: 'firstName', anyOf: ['nombres', 'primer_nombre', 'nombre_s'], noneOf: ['completo', 'club', 'socio'], priority: 10 },
  { field: 'paternalSurname', anyOf: ['apellido_paterno', 'paterno', 'apellido_pat'], priority: 11 },
  { field: 'maternalSurname', anyOf: ['apellido_materno', 'materno', 'apellido_mat'], priority: 11 },
  { field: 'paternalSurname', anyOf: ['apellido', 'apellidos'], noneOf: ['materno', 'paterno'], priority: 6 },

  { field: 'email', anyOf: ['correo', 'email', 'e_mail', 'mail'], priority: 14 },
  { field: 'phone', anyOf: ['telefono', 'tel', 'phone', 'fijo'], noneOf: ['celular', 'movil', 'mobile'], priority: 12 },
  { field: 'mobile', anyOf: ['celular', 'movil', 'mobile', 'whatsapp'], priority: 13 },

  { field: 'joinedOnRaw', anyOf: ['fecha_ingreso', 'fecha_alta', 'ingreso', 'alta', 'joined'], priority: 11 },
  { field: 'sexRaw', anyOf: ['sexo', 'sex', 'genero'], priority: 10 },
  { field: 'membershipRaw', anyOf: ['membresia', 'membership', 'tipo_membresia', 'plan'], noneOf: ['modalidad', 'arma'], priority: 10 },
  { field: 'membershipModalityRaw', anyOf: ['modalidad_membresia', 'modalidad_socio', 'modalidad_plan'], priority: 11 },
  { field: 'membershipModalityRaw', anyOf: ['modalidad'], noneOf: ['arma', 'membresia'], priority: 5 },

  { field: 'fullAddress', allOf: [['direccion'], ['socio']], noneOf: ['club'], priority: 15 },
  { field: 'fullAddress', allOf: [['domicilio'], ['socio']], noneOf: ['club'], priority: 15 },
  { field: 'fullAddress', anyOf: ['direccion_completa', 'domicilio_completo', 'domicilio_del_socio'], priority: 14 },
  { field: 'fullAddress', anyOf: ['direccion', 'domicilio', 'address'], noneOf: ['club', 'calle', 'colonia', 'cp', 'estado', 'municipio'], priority: 7 },

  { field: 'addressLine', anyOf: ['calle', 'calle_y_numero', 'domicilio', 'direccion'], noneOf: ['club', 'completo', 'completa', 'socio', 'colonia', 'cp'], priority: 6 },
  { field: 'colony', anyOf: ['colonia', 'fraccionamiento', 'col', 'asentamiento'], priority: 9 },
  { field: 'city', anyOf: ['municipio', 'ciudad', 'localidad', 'delegacion'], priority: 9 },
  { field: 'state', anyOf: ['estado', 'entidad', 'entidad_federativa'], priority: 9 },
  { field: 'zip', anyOf: ['cp', 'codigo_postal', 'zip', 'postal'], priority: 10 },
];

const WEAPON_HEADER_RULES: HeaderFieldRule[] = [
  { field: 'weaponModel', anyOf: ['modelo'], noneOf: ['membresia', 'club', 'tipo'], priority: 22 },
  { field: 'weaponBrand', allOf: [['marca'], ['arma']], priority: 16 },
  { field: 'weaponCaliber', allOf: [['calibre'], ['arma']], priority: 16 },
  { field: 'weaponModel', allOf: [['modelo'], ['arma']], priority: 18 },
  { field: 'weaponSerial', allOf: [['matricula'], ['arma']], priority: 17 },
  { field: 'weaponSerial', allOf: [['serie'], ['arma']], noneOf: ['socio'], priority: 16 },

  { field: 'weaponBrand', anyOf: ['marca'], noneOf: ['membresia', 'club', 'socio'], priority: 14 },
  { field: 'weaponModel', anyOf: ['modelo_arma', 'modelo_del_arma'], noneOf: ['membresia', 'club'], priority: 17 },
  {
    field: 'weaponPlatform',
    anyOf: ['clase', 'clase_del_arma', 'clase_arma'],
    noneOf: ['membresia', 'club', 'socio', 'modalidad', 'modelo'],
    priority: 13,
  },
  {
    field: 'weaponCaliber',
    anyOf: ['calibre', 'calibre_arma'],
    noneOf: ['membresia', 'clase', 'registro', 'club', 'corta', 'larga', 'sedena'],
    priority: 14,
  },
  { field: 'weaponCaliber', anyOf: ['cal'], noneOf: ['membresia', 'clase', 'registro', 'club', 'corta', 'larga'], priority: 10 },
  {
    field: 'weaponSerial',
    anyOf: ['matricula', 'matricula_arma', 'no_serie', 'no_de_serie', 'numero_de_serie', 'num_de_serie', 'n_serie'],
    noneOf: ['socio', 'membresia', 'club'],
    priority: 15,
  },
  { field: 'weaponSerial', anyOf: ['serie', 'numero_serie', 'num_serie', 'serial'], noneOf: ['socio', 'membresia', 'registro_club'], priority: 13 },
  { field: 'weaponPlatform', anyOf: ['plataforma', 'tipo_arma', 'tipo_de_arma', 'sistema', 'descripcion_arma'], noneOf: ['membresia', 'modalidad_socio', 'clase', 'modelo'], priority: 9 },
  { field: 'weaponPlatform', anyOf: ['tipo', 'descripcion'], noneOf: ['membresia', 'modalidad_socio', 'clase', 'modelo', 'socio'], priority: 7 },
  { field: 'weaponModality', anyOf: ['modalidad_arma', 'modalidad_registro'], priority: 11 },
  { field: 'weaponHasPeta', anyOf: ['peta', 'con_peta'], priority: 10 },
  { field: 'weaponRegisteredOn', anyOf: ['fecha_registro', 'registrada', 'registro_arma'], priority: 10 },
];

export function matchMemberFieldFromHeader(header: string): ImportFieldId | null {
  if (isIgnoredHeaderByKeywords(header)) {
    return null;
  }
  const key = normalizeKey(header);
  if (!key) {
    return null;
  }
  const tokens = tokenizeHeaderKey(key);
  return pickBestField(MEMBER_HEADER_RULES, key, tokens);
}

export function matchWeaponFieldFromHeader(header: string): ImportFieldId | null {
  if (isIgnoredHeaderByKeywords(header)) {
    return null;
  }
  const key = normalizeKey(header);
  if (!key) {
    return null;
  }
  const tokens = tokenizeHeaderKey(key);
  return pickBestField(WEAPON_HEADER_RULES, key, tokens);
}

export function matchImportFieldFromHeader(header: string): ImportFieldId | null {
  if (isIgnoredHeaderByKeywords(header)) {
    return 'ignore';
  }
  const member = matchMemberFieldFromHeader(header);
  if (member) {
    return member;
  }
  return matchWeaponFieldFromHeader(header);
}

/** Qué tan literalmente el encabezado nombra el campo (para desempatar columnas). */
const HEADER_AFFINITY_TERMS: Partial<Record<ImportFieldId, readonly string[]>> = {
  memberNumber: ['no_socio', 'num_socio', 'numero_socio', 'numero_de_socio', 'nro_socio'],
  curp: ['curp'],
  fullName: ['nombre_del_socio', 'nombre_socio', 'nombre_completo', 'nombre'],
  rfc: ['rfc'],
  weaponModel: ['modelo', 'modelo_arma', 'modelo_del_arma'],
  weaponBrand: ['marca', 'marca_arma'],
  weaponCaliber: ['calibre', 'cal'],
  weaponSerial: ['no_de_serie', 'numero_de_serie', 'serie', 'matricula', 'no_serie', 'num_serie'],
  weaponPlatform: ['tipo_de_arma', 'tipo_arma', 'clase_del_arma', 'tipo', 'clase'],
  weaponModality: ['modalidad_arma', 'modalidad'],
};

export function headerAffinityScore(header: string, fieldId: ImportFieldId): number {
  const key = normalizeKey(header);
  if (!key) {
    return 0;
  }
  const tokens = tokenizeHeaderKey(key);
  const terms = HEADER_AFFINITY_TERMS[fieldId];
  if (!terms?.length) {
    return 0;
  }
  if (terms.includes(key)) {
    return 100;
  }
  let best = 0;
  for (const term of terms) {
    if (key === term) {
      best = Math.max(best, 100);
    } else if (headerIncludes(key, tokens, term)) {
      best = Math.max(best, term.length >= 5 ? 85 : 65);
    }
  }
  return best;
}