import { Info } from "lucide-react";
export function BlogOfferAlert() {
  return (
    <aside
      className="blog-offer-alert"
      aria-label="Transparência sobre afiliados"
    >
      <div className="blog-offer-alert-heading">
        <Info size={20} />
        <strong>Informação e transparência</strong>
      </div>
      <p>
        Alguns links podem gerar comissão ao Geek Musical. Confira o modelo, a
        disponibilidade e as condições de compra na loja.
      </p>
      <a href="/affiliate-disclosure/">
        Como funcionam nossos links de afiliados
      </a>
    </aside>
  );
}
