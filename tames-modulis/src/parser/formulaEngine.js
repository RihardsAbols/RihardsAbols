// Minimāls Excel formulu tokenizētājs/parseris/izpildītājs — TIKAI tam formulu
// vārdu krājumam, kas reāli sastopams abos paraugfailos (skat. PROGRESS.md
// Sesija 3): +,-,*,/,%,^,=; SUM, ROUND, IF, COUNTA, COUNTBLANK; šūnu atsauces
// (relatīvas/absolūtas), diapazoni, lapu prefiksi (arī pēdiņotie un
// "[n]Sheet!Ref" ārējās saites marķieri, kas šeit vienmēr tiek uztverti kā
// iekšēja atsauce — skat. CLAUDE.md piezīmi par 'A General requirements').
//
// Šis NAV vispārīgs Excel formulu dzinējs — tas apzināti neatbalsta vārdu
// krājumu ārpus novērotā, lai nebūvētu neko, kas nav pierādīts ar reāliem
// datiem (skat. spec §1 "kodola loģika kā tīras, testējamas funkcijas").

const TOKEN_SPECS = [
  ['WS', /^\s+/],
  [
    'SHEET_QUOTED_REF',
    /^(?:\[\d+\])?'((?:[^']|'')+)'!(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)/i,
  ],
  [
    'SHEET_REF',
    /^(?:\[\d+\])?([A-Za-z_][A-Za-z0-9_.]*)!(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)/,
  ],
  ['RANGE', /^\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?\d+/i],
  ['REF', /^\$?[A-Z]{1,3}\$?\d+/i],
  ['NUMBER', /^\d+(?:\.\d+)?%?/],
  ['STRING', /^"([^"]*)"/],
  ['IDENT', /^[A-Za-z][A-Za-z0-9_.]*/],
  ['OP', /^(<>|<=|>=|[+\-*/^&=<>])/],
  ['LPAREN', /^\(/],
  ['RPAREN', /^\)/],
  ['COMMA', /^,/],
];

function tokenize(formula) {
  let s = formula.trim();
  if (s.startsWith('=')) s = s.slice(1);
  const tokens = [];
  while (s.length > 0) {
    let matched = false;
    for (const [type, re] of TOKEN_SPECS) {
      const m = re.exec(s);
      if (m) {
        matched = true;
        if (type !== 'WS') tokens.push({ type, raw: m[0], groups: m.slice(1) });
        s = s.slice(m[0].length);
        break;
      }
    }
    if (!matched) {
      throw new Error(`Nevar tokenizēt formulu pie: "${s.slice(0, 20)}..." (pilna formula: ${formula})`);
    }
  }
  return tokens;
}

function parseRefToken(raw, groups, tokenType) {
  if (tokenType === 'SHEET_QUOTED_REF' || tokenType === 'SHEET_REF') {
    const sheet = groups[0].replace(/''/g, "'");
    const refPart = groups[1];
    if (refPart.includes(':')) {
      const [start, end] = refPart.split(':');
      return { type: 'Range', sheet, start, end };
    }
    return { type: 'Ref', sheet, address: refPart };
  }
  if (tokenType === 'RANGE') {
    const [start, end] = raw.split(':');
    return { type: 'Range', sheet: null, start, end };
  }
  return { type: 'Ref', sheet: null, address: raw };
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    return this.tokens[this.pos++];
  }

  expect(type) {
    const t = this.next();
    if (!t || t.type !== type) {
      throw new Error(`Sagaidīts ${type}, atrasts ${t ? t.type + ' (' + t.raw + ')' : 'formulas beigas'}`);
    }
    return t;
  }

  parseExpression() {
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parseConcat();
    while (this.peek() && this.peek().type === 'OP' && ['=', '<>', '<', '>', '<=', '>='].includes(this.peek().raw)) {
      const op = this.next().raw;
      const right = this.parseConcat();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseConcat() {
    let left = this.parseAdditive();
    while (this.peek() && this.peek().type === 'OP' && this.peek().raw === '&') {
      this.next();
      const right = this.parseAdditive();
      left = { type: 'Binary', op: '&', left, right };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.peek() && this.peek().type === 'OP' && (this.peek().raw === '+' || this.peek().raw === '-')) {
      const op = this.next().raw;
      const right = this.parseMultiplicative();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.peek() && this.peek().type === 'OP' && (this.peek().raw === '*' || this.peek().raw === '/')) {
      const op = this.next().raw;
      const right = this.parseUnary();
      left = { type: 'Binary', op, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.peek() && this.peek().type === 'OP' && this.peek().raw === '-') {
      this.next();
      return { type: 'Unary', op: '-', arg: this.parseUnary() };
    }
    return this.parsePower();
  }

  parsePower() {
    let base = this.parsePrimary();
    if (this.peek() && this.peek().type === 'OP' && this.peek().raw === '^') {
      this.next();
      const exponent = this.parseUnary();
      base = { type: 'Binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) throw new Error('Negaidītas formulas beigas');

    if (t.type === 'NUMBER') {
      this.next();
      const isPercent = t.raw.endsWith('%');
      const num = parseFloat(isPercent ? t.raw.slice(0, -1) : t.raw);
      return { type: 'Number', value: isPercent ? num / 100 : num };
    }
    if (t.type === 'STRING') {
      this.next();
      return { type: 'String', value: t.groups[0] };
    }
    if (t.type === 'SHEET_QUOTED_REF' || t.type === 'SHEET_REF' || t.type === 'RANGE' || t.type === 'REF') {
      this.next();
      return parseRefToken(t.raw, t.groups, t.type);
    }
    if (t.type === 'LPAREN') {
      this.next();
      const expr = this.parseExpression();
      this.expect('RPAREN');
      return expr;
    }
    if (t.type === 'IDENT') {
      this.next();
      const name = t.raw.toUpperCase();
      this.expect('LPAREN');
      const args = [];
      if (!(this.peek() && this.peek().type === 'RPAREN')) {
        args.push(this.parseExpression());
        while (this.peek() && this.peek().type === 'COMMA') {
          this.next();
          args.push(this.parseExpression());
        }
      }
      this.expect('RPAREN');
      return { type: 'Call', name, args };
    }
    throw new Error(`Negaidīts tokens: ${t.type} (${t.raw})`);
  }
}

export function parseFormula(formula) {
  const tokens = tokenize(formula);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  if (parser.pos < tokens.length) {
    throw new Error(`Neizmantoti tokeni pēc parsēšanas formulā: ${formula}`);
  }
  return ast;
}

function toNumber(value) {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function evaluateRange(node, ctx) {
  const sheet = node.sheet || ctx.currentSheet;
  return ctx.getRangeValues(sheet, node.start, node.end);
}

export function evaluateFormula(ast, ctx) {
  switch (ast.type) {
    case 'Number':
      return ast.value;
    case 'String':
      return ast.value;
    case 'Ref': {
      const sheet = ast.sheet || ctx.currentSheet;
      return ctx.getCellValue(sheet, ast.address);
    }
    case 'Range':
      // Diapazons ārpus funkcijas argumenta (piem. tieši saskaitīts) — reti,
      // bet der atbalstīt: sasummē visas vērtības.
      return evaluateRange(ast, ctx).reduce((a, b) => a + toNumber(b), 0);
    case 'Unary': {
      const v = toNumber(evaluateFormula(ast.arg, ctx));
      return ast.op === '-' ? -v : v;
    }
    case 'Binary': {
      const left = evaluateFormula(ast.left, ctx);
      const right = evaluateFormula(ast.right, ctx);
      switch (ast.op) {
        case '+':
          return toNumber(left) + toNumber(right);
        case '-':
          return toNumber(left) - toNumber(right);
        case '*':
          return toNumber(left) * toNumber(right);
        case '/':
          return toNumber(left) / toNumber(right);
        case '^':
          return Math.pow(toNumber(left), toNumber(right));
        case '&':
          return `${left ?? ''}${right ?? ''}`;
        case '=':
          return toNumber(left) === toNumber(right) || left === right;
        case '<>':
          return !(toNumber(left) === toNumber(right) || left === right);
        case '<':
          return toNumber(left) < toNumber(right);
        case '>':
          return toNumber(left) > toNumber(right);
        case '<=':
          return toNumber(left) <= toNumber(right);
        case '>=':
          return toNumber(left) >= toNumber(right);
        default:
          throw new Error(`Nezināms operators: ${ast.op}`);
      }
    }
    case 'Call':
      return evaluateCall(ast, ctx);
    default:
      throw new Error(`Nezināms AST mezgls: ${ast.type}`);
  }
}

function isBlank(value) {
  return value == null || value === '';
}

function evaluateCall(node, ctx) {
  const args = node.args;
  switch (node.name) {
    case 'SUM': {
      let total = 0;
      for (const arg of args) {
        if (arg.type === 'Range') {
          for (const v of evaluateRange(arg, ctx)) total += toNumber(v);
        } else {
          total += toNumber(evaluateFormula(arg, ctx));
        }
      }
      return total;
    }
    case 'ROUND': {
      const value = toNumber(evaluateFormula(args[0], ctx));
      const digits = toNumber(evaluateFormula(args[1], ctx));
      const factor = Math.pow(10, digits);
      return Math.round(value * factor) / factor;
    }
    case 'IF': {
      const cond = evaluateFormula(args[0], ctx);
      const isTrue = typeof cond === 'boolean' ? cond : toNumber(cond) !== 0;
      if (isTrue) return args[1] ? evaluateFormula(args[1], ctx) : true;
      return args[2] ? evaluateFormula(args[2], ctx) : false;
    }
    case 'COUNTA': {
      let count = 0;
      for (const arg of args) {
        const values = arg.type === 'Range' ? evaluateRange(arg, ctx) : [evaluateFormula(arg, ctx)];
        for (const v of values) if (!isBlank(v)) count++;
      }
      return count;
    }
    case 'COUNTBLANK': {
      let count = 0;
      for (const arg of args) {
        const values = arg.type === 'Range' ? evaluateRange(arg, ctx) : [evaluateFormula(arg, ctx)];
        for (const v of values) if (isBlank(v)) count++;
      }
      return count;
    }
    default:
      throw new Error(`Neatbalstīta funkcija: ${node.name}`);
  }
}
