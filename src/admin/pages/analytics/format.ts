export const number = (value: number | null | undefined) =>
  value == null
    ? "Sem dados"
    : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export const percent = (value: number | null | undefined) =>
  value == null
    ? "Sem dados"
    : (value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
