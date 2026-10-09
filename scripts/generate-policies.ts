import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";
import {
  convertWordpressPost,
  plainWordpressText,
  type WordpressExport,
  type WordpressPost,
} from "./wordpress-convert.js";
import type {
  InstitutionalContent,
  ContentSection,
} from "../shared/institutional.js";
const data = JSON.parse(
  readFileSync("artifacts/wordpress/export.private.json", "utf8"),
) as WordpressExport & { pages: (WordpressPost & { status: string })[] };
const result: Record<string, InstitutionalContent> = {};
for (const slug of [
  "politica-de-privacidade",
  "termos-de-uso",
  "sobre",
  "affiliate-disclosure",
]) {
  const post = data.pages.find(
    (p) => p.slug === slug && p.status === "publish",
  );
  if (!post) continue;
  const conversion = convertWordpressPost(
    post,
    data,
    (url) => {
      try {
        const u = new URL(url, "https://www.geekmusical.com.br");
        return u.protocol === "https:" ? u.href : undefined;
      } catch {
        return undefined;
      }
    },
    true,
  );
  const sections: ContentSection[] = [];
  let current: ContentSection = {
    title: "Informações do Geek Musical",
    paragraphs: [],
  };
  sections.push(current);
  for (const token of marked.lexer(conversion.body)) {
    if (token.type === "heading") {
      current = {
        title: plainWordpressText(
          String(marked.parseInline(token.text, { async: false })),
        ),
        paragraphs: [],
      };
      sections.push(current);
    } else if (token.type !== "space") {
      const paragraph = plainWordpressText(
        String(marked.parse(token.raw, { async: false })),
      );
      if (paragraph) current.paragraphs.push(paragraph);
    }
  }
  result["/" + slug + "/"] = {
    eyebrow: "GEEK MUSICAL",
    intro: post.title,
    sections: sections.filter((s) => s.paragraphs.length),
  };
}

const privacy = result["/politica-de-privacidade/"];
privacy.sections = privacy.sections
  .map((section) => ({
    ...section,
    paragraphs: section.paragraphs.filter(
      (p) =>
        !/AdSense|DoubleClick|publicidade comportamental|Vários parceiros anunciam|Utilizamos anúncios|GuiaProduto/i.test(
          p,
        ),
    ),
  }))
  .filter((section) => section.paragraphs.length);
privacy.sections.push({
  title: "Dados tratados no portal editorial",
  paragraphs: [
    "A nova aplicação processa dados técnicos de conexão e registros de acesso para servir as páginas, proteger a administração e investigar erros. Administradores utilizam cookies necessários de sessão; a preferência de tema é armazenada no navegador.",
    "A medição de audiência e os anúncios de terceiros estão desativados na nova aplicação. Caso uma integração de audiência seja habilitada, seu carregamento depende da configuração própria do Geek Musical e do consentimento correspondente.",
    "Links afiliados encaminham você às lojas, que podem usar cookies e tratar dados conforme suas políticas. O Geek Musical não recebe seus dados de pagamento e não processa compras.",
    "O formulário de contato e as Web Stories continuam sendo atendidos pela instalação WordPress preservada e pelos serviços nela configurados. Utilize a página de Contato para perguntas sobre seus dados, pedidos de acesso, correção ou exclusão, observados os requisitos legais aplicáveis.",
  ],
});
result["/termos-de-uso/"].sections.push({
  title: "Conteúdo editorial e links comerciais",
  paragraphs: [
    "O Geek Musical publica informações sobre música, instrumentos e equipamentos. Recomendações editoriais não substituem a consulta às especificações do fabricante nem garantem adequação a todo contexto de uso.",
    "Links de afiliados podem gerar comissão para o portal. Preços, disponibilidade, frete, garantia e condições de compra são definidos pelas lojas e devem ser consultados no destino. A presença de um link não constitui um teste físico do produto.",
    "Textos históricos preservam seu contexto e suas datas. Correções podem ser solicitadas pela página de Contato. O uso do portal está sujeito à legislação brasileira aplicável.",
  ],
});
result["/sobre/"] = {
  eyebrow: "GEEK MUSICAL",
  intro: "Música, instrumentos e informação para a sua jornada.",
  sections: [
    {
      title: "O portal",
      paragraphs: [
        "O Geek Musical reúne reviews, rankings, guias de compra e aprendizado musical para músicos iniciantes, estudantes, produtores e quem quer conhecer melhor seus instrumentos.",
        "O portal foi criado por Daniel, conforme o texto institucional original. O acervo reúne conteúdos sobre violão, guitarra, baixo, teclados, percussão, áudio e outros temas musicais.",
      ],
    },
    {
      title: "Como tratamos o conteúdo",
      paragraphs: [
        "Os artigos preservam suas datas originais. Uma recomendação editorial não significa que realizamos um teste físico: quando houver teste, seu contexto e suas evidências devem estar identificados no artigo.",
        "Informações podem mudar ou depender de versão, fabricante e mercado. Confira o modelo exato e as especificações oficiais antes de comprar. Correções e sugestões podem ser enviadas pela página de Contato.",
      ],
    },
    {
      title: "Como o portal é financiado",
      paragraphs: [
        "Alguns links são afiliados e podem gerar comissão por compras qualificadas. Mantemos divulgação dessa relação e identificamos os destinos comerciais. Leia nossa declaração de afiliados para entender as parcerias.",
      ],
    },
  ],
};
result["/politica-editorial/"] = {
  eyebrow: "EDITORIAL",
  intro: "Critérios para publicar, preservar e corrigir informações musicais.",
  sections: [
    {
      title: "Fontes e evidências",
      paragraphs: [
        "Especificações devem corresponder ao modelo e à variante descritos. Priorize documentação do fabricante, manuais e fontes identificadas. Alegações de teste físico exigem registro do teste; não deduzimos testes a partir de material de terceiros.",
        "Rankings expressam escolhas editoriais no contexto e na data do artigo. A comissão de afiliados não constitui evidência de qualidade e não deve determinar sua ordem.",
      ],
    },
    {
      title: "Preservação e correções",
      paragraphs: [
        "O acervo histórico mantém URL, autoria, datas e profundidade. Correções factuais precisam registrar o trecho alterado, o motivo, a fonte e a data real da consulta.",
        "Dúvidas sem fonte suficiente permanecem como pendências verificáveis. Não atualizamos anos, datas ou produtos automaticamente. Solicite correções pela página de Contato.",
      ],
    },
  ],
};
result["/politica-de-cookies/"] = {
  eyebrow: "PRIVACIDADE",
  intro: "Armazenamento necessário e opções de privacidade.",
  sections: [
    {
      title: "Preferências e sessões",
      paragraphs: [
        "O navegador pode guardar sua escolha de tema e de preferências. A administração utiliza cookies de sessão restritos e necessários para autenticação e segurança.",
        "A medição de audiência está desativada na aplicação inicial. Quando habilitada, seu carregamento respeita a configuração e o consentimento correspondente. As lojas de destino e o WordPress legado podem utilizar serviços próprios, descritos nas respectivas políticas.",
      ],
    },
  ],
};
result["/transparencia-afiliados/"] = {
  eyebrow: "TRANSPARÊNCIA",
  intro: "Informações sobre as parcerias comerciais.",
  sections: [
    {
      title: "Links afiliados",
      paragraphs: [
        "Podemos receber comissão por compras qualificadas nos links indicados. A loja determina preços, estoque e condições. Confirme o modelo e as condições na página de compra.",
      ],
    },
  ],
};
result["/affiliate-disclosure/"] = {
  eyebrow: "TRANSPARÊNCIA",
  intro: "Como funcionam os links de afiliados do Geek Musical.",
  sections: [
    {
      title: "Parcerias comerciais",
      paragraphs: [
        "Podemos receber comissão por compras qualificadas realizadas através dos links de afiliados, sem custo adicional para você. Como associado da Amazon, ganhamos com compras qualificadas.",
        "O portal mantém links para Amazon, Mercado Livre, Shopee e parceiros presentes no acervo histórico. A comissão não determina a posição de um produto em um ranking. A decisão de compra e a confirmação do modelo, preço e condições devem ser realizadas na loja.",
      ],
    },
  ],
};
result["/termos-de-uso/"].sections = result["/termos-de-uso/"].sections.filter(
  (section) => section.title !== "Lei aplicável",
);
writeFileSync(
  "shared/institutional.ts",
  "export interface ContentSection { title: string; paragraphs: string[]; bullets?: string[]; links?: {label: string; href: string}[]; }\nexport interface InstitutionalContent {eyebrow: string; intro: string; sections: ContentSection[];}\nexport const institutional: Record<string, InstitutionalContent> = " +
    JSON.stringify(result, null, 2) +
    ";\n",
);
console.log(
  "Páginas próprias preservadas e adaptadas ao tratamento real de dados.",
);
