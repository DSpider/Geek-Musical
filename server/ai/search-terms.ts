import type { Category, SearchIntent } from "../../shared/types.js";
import { normalizeSpokenNumbers } from "./numbers.js";

export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Lexical equivalents only: preserve brands, models, quantities and specifications.
export const productSearchText = (text: string) =>
  fold(text.normalize("NFKC"))
    .replace(/\bair[ -]?fryer\b/g, "airfryer")
    .replace(/\blavadora(?:\s+de)?\s+roupas?\b/g, "maquina lavar")
    .replace(/\bmaquina(?:\s+de)?\s+lavar(?:\s+roupas?)?\b/g, "maquina lavar");

// Remove conversational context, never concrete specifications or product names.
export function compactSearchText(query: string): string {
  const text = normalizeSpokenNumbers(
    fold(query).replace(
      /\b(?:um|uma)\b(?!\s+(?:litro|kg|quilo|gb|tb|cm|centimetro|polegada|watt|volt))/g,
      "",
    ),
  );
  return text
    .replace(
      /(?:ate|entre|por|de|orcamento(?: de)?|no maximo)\s+r?\$?\s*[\d.,]+\s*(?:mil|k)?(?:\s+(?:e|a)\s+[\d.,]+)?/g,
      (match, offset: number) =>
        /^\s*(?:cm\b|gb\b|tb\b|pol\b|polegadas\b|hz\b|kg\b|litros?\b|l\b|w\b|v\b)/.test(
          text.slice(offset + match.length),
        )
          ? match
          : "",
    )
    .replace(
      /\b(?:para\s+)?(?:usar|uso)\s+(?:todos os dias|no dia a dia|diario|diariamente)\b/g,
      "",
    )
    .replace(
      /\b(?:todos os dias|dia a dia|no dia a dia|diariamente|sem complicacao)\b/g,
      "",
    )
    .replace(
      /\b(?:quero|preciso|procuro|busco|comprar|encontre|me|meu|minha|ajude|gostaria|de|um|uma|bom|boa|melhor|para|pratic[oa]|barat[oa]|reais|algo)\b/g,
      "",
    )
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:cm|centimetros?)\b/g, "$1cm")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

interface SearchCandidate {
  keywords: string;
  label: string;
  category: Category;
  description: string;
}

// These are semantic alternatives for requests describing only a use. Arbitrary
// named products are also candidates below; this list is not a category gate.
const semanticProducts: SearchCandidate[] = [
  {
    keywords: "cafeteira",
    label: "Cafeteira",
    category: "appliance",
    description: "Equipamento para preparar café",
  },
  {
    keywords: "air fryer",
    label: "Air fryer",
    category: "appliance",
    description: "Fritadeira elétrica sem óleo",
  },
  {
    keywords: "geladeira",
    label: "Geladeira",
    category: "appliance",
    description: "Refrigerar e conservar alimentos",
  },
  {
    keywords: "lavadora",
    label: "Lavadora",
    category: "appliance",
    description: "Máquina para lavar roupas",
  },
  {
    keywords: "aspirador",
    label: "Aspirador",
    category: "appliance",
    description: "Aspirar poeira da casa",
  },
  {
    keywords: "micro-ondas",
    label: "Micro-ondas",
    category: "appliance",
    description: "Aquecer refeições rapidamente",
  },
  {
    keywords: "ventilador",
    label: "Ventilador",
    category: "appliance",
    description: "Ventilar ambientes",
  },
  {
    keywords: "liquidificador",
    label: "Liquidificador",
    category: "appliance",
    description: "Preparar vitaminas e triturar alimentos",
  },
  {
    keywords: "batedeira",
    label: "Batedeira",
    category: "appliance",
    description: "Bater massas e cremes",
  },
  {
    keywords: "chaleira eletrica",
    label: "Chaleira elétrica",
    category: "appliance",
    description: "Ferver água",
  },
  {
    keywords: "notebook",
    label: "Notebook",
    category: "notebook",
    description: "Computador portátil",
  },
  {
    keywords: "smartphone",
    label: "Celular",
    category: "smartphone",
    description: "Telefone celular",
  },
  {
    keywords: "smartwatch",
    label: "Smartwatch",
    category: "smartwatch",
    description: "Relógio inteligente para atividades e notificações",
  },
  {
    keywords: "smart tv",
    label: "TV",
    category: "tv",
    description: "Televisão para assistir filmes e séries",
  },
  {
    keywords: "fone bluetooth",
    label: "Fone de ouvido",
    category: "headphones",
    description: "Ouvir áudio individualmente com fones",
  },
  {
    keywords: "monitor",
    label: "Monitor",
    category: "monitor",
    description: "Tela externa para computador",
  },
  {
    keywords: "tablet",
    label: "Tablet",
    category: "tablet",
    description: "Dispositivo portátil com tela sensível ao toque",
  },
  {
    keywords: "cadeira ergonomica",
    label: "Cadeira ergonômica",
    category: "other",
    description: "Sentar com apoio para trabalhar",
  },
  {
    keywords: "caixa de som bluetooth",
    label: "Caixa de som Bluetooth",
    category: "other",
    description: "Reproduzir música para um ambiente ou grupo",
  },
  {
    keywords: "roteador wifi",
    label: "Roteador Wi-Fi",
    category: "other",
    description: "Distribuir conexão de rede sem fio",
  },
];

export function applianceLabel(query: string): string | undefined {
  const text = productSearchText(query);
  if (/\bmaquina lavar\b/.test(text)) return "Máquina de lavar";
  return semanticProducts.find(
    (candidate) =>
      candidate.category === "appliance" &&
      new RegExp(
        `\\b${candidate.keywords.replace("air fryer", "air ?fryer").replace("micro-ondas", "micro.?ondas")}\\b`,
      ).test(text),
  )?.label;
}

export function searchCandidates(query: string, fallback: SearchIntent) {
  const candidates: Record<string, SearchCandidate> = {};
  candidates.keep = {
    keywords: fallback.keywords,
    label: fallback.categoryLabel,
    category: fallback.category,
    description:
      "Não há evidência suficiente para identificar um produto nas outras opções. Manter a consulta original, sem supor qual produto a pessoa deseja.",
  };
  const seen = new Set<string>();
  const add = (candidate: SearchCandidate) => {
    if (!candidate.keywords || seen.has(candidate.keywords)) return;
    seen.add(candidate.keywords);
    candidates[`product_${seen.size}`] = candidate;
  };
  const compact = compactSearchText(query);
  const words = compact.split(/\s+/);
  const useOnly =
    /^(?:preparar|fazer|ouvir|assistir|lavar|limpar|aquecer|ferver|refrigerar|conservar|ventilar)\b/.test(
      compact,
    );
  const addPhrase = (keywords: string) => {
    if (!/[a-z]/.test(keywords) || /^(?:com|sem|e|ou|ate)$/.test(keywords))
      return;
    add({
      keywords,
      label: keywords[0].toUpperCase() + keywords.slice(1),
      category: fallback.category,
      description: `Buscar o produto explicitamente citado: ${keywords}. Preserve tipo, marca e especificações mencionadas.`,
    });
  };
  if (!useOnly) addPhrase(compact);
  // Bounded choices built from the request make the vocabulary open to new
  // products, while the model can return only an ID from this server-side map.
  for (let size = useOnly ? 0 : 3; size >= 1; size--) {
    for (
      let start = 0;
      start + size <= words.length && seen.size < 40;
      start++
    ) {
      addPhrase(words.slice(start, start + size).join(" "));
    }
  }
  for (const candidate of semanticProducts) add(candidate);
  return candidates;
}
