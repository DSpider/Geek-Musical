const words: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
  mil: 1000,
};
const token = Object.keys(words).join("|");
const sequence = new RegExp(
  `\\b(?:${token})(?:\\s+(?:e\\s+)?(?:${token}))*\\b`,
  "g",
);
// Input is accent-folded. This makes voice transcripts and typed numbers equivalent.
export function normalizeSpokenNumbers(text: string): string {
  return text
    .replace(sequence, (match: string, offset: number) => {
      if (match.startsWith("mil") && /\d\s+$/.test(text.slice(0, offset)))
        return match;
      let total = 0;
      let group = 0;
      for (const word of match.split(/\s+/)) {
        if (word === "e") continue;
        const value = words[word];
        if (value === 1000) {
          total += (group || 1) * 1000;
          group = 0;
        } else group += value;
      }
      return String(total + group);
    })
    .replace(/\bgigabytes?\b|\bgigas?\b/g, "gb");
}
