// Public identity only. Credentials and deployment settings belong in server/.
export const editorialSearchHref = "/blog/";
export const site = {
  name: "Geek Musical",
  defaultUrl: "https://www.geekmusical.com.br",
  company: "Geek Musical",
  cnpj: "",
  location: "",
  email: "contato@geekmusical.com.br",
  updatedAt: "2026-10-08",
  social: [] as { name: string; url: string }[],
};
export interface PageInfo {
  title: string;
  description: string;
  label: string;
}
export const pages: Record<string, PageInfo> = {
  "/contato/": {
    label: "Contato",
    title: "Contato | Geek Musical",
    description:
      "Entre em contato com o Geek Musical para dúvidas, sugestões e correções sobre os guias e instrumentos e equipamentos musicais.",
  },
  "/politica-editorial/": {
    label: "Política Editorial",
    title: "Política Editorial | Geek Musical",
    description:
      "Conheça as regras de preservação, atualização, revisão, fontes e transparência dos guias e artigos do Geek Musical.",
  },
  "/politica-de-cookies/": {
    label: "Política de Cookies",
    title: "Política de Cookies | Geek Musical",
    description:
      "Entenda as preferências de tema, as sessões administrativas e as opções de consentimento de Analytics no Geek Musical.",
  },
  "/transparencia-afiliados/": {
    label: "Transparência de Afiliados",
    title: "Transparência de Afiliados | Geek Musical",
    description:
      "Saiba como funcionam os links comerciais, as comissões de afiliados e as condições de compra nas lojas parceiras do Geek Musical.",
  },
  "/affiliate-disclosure/": {
    label: "Declaração de Afiliados",
    title: "Declaração de Afiliados | Geek Musical",
    description:
      "Consulte a declaração de afiliados original do Geek Musical, preservada para transparência sobre as parcerias do portal.",
  },
  "/": {
    label: "Início",
    title: "Geek Musical | Tudo sobre música você encontra aqui",
    description:
      "Explore instrumentos musicais, reviews, rankings e guias para aprender, produzir e fazer escolhas informadas.",
  },
  "/blog/": {
    label: "Blog",
    title: "Instrumentos, reviews e dicas musicais | Geek Musical",
    description:
      "Explore reviews, rankings, instrumentos musicais, equipamentos de áudio, produção musical e guias para músicos.",
  },
  "/mapa-do-site/": {
    label: "Mapa do Site",
    title: "Mapa do Site | Geek Musical",
    description:
      "Encontre os artigos, as categorias, a navegação editorial e as informações institucionais do Geek Musical em um único lugar.",
  },
  "/politica-de-privacidade/": {
    label: "Política de Privacidade",
    title: "Política de Privacidade | Geek Musical",
    description:
      "Entenda o tratamento dos dados na navegação, os serviços envolvidos, as preferências de cookies e como exercer seus direitos de privacidade.",
  },
  "/termos-de-uso/": {
    label: "Termos de Uso",
    title: "Termos de Uso | Geek Musical",
    description:
      "Conheça as condições de uso dos artigos e das recomendações de equipamentos musicais, além dos limites e da transparência sobre afiliados.",
  },
  "/sobre/": {
    label: "Sobre",
    title: "Sobre o Geek Musical",
    description:
      "Conheça o Geek Musical, um portal de música, instrumentos, reviews, rankings e dicas para músicos.",
  },
};
export const notFoundPage: PageInfo = {
  label: "Página não encontrada",
  title: "Página não encontrada | Geek Musical",
  description:
    "Esta página não está disponível. Explore o blog e os guias musicais do Geek Musical.",
};
