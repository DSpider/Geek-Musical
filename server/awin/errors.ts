export class AwinError extends Error {
  constructor(readonly code: string) {
    super("Não foi possível concluir a operação Awin.");
    this.name = "AwinError";
  }
}
export function awinErrorCode(error: unknown) {
  return error instanceof AwinError ? error.code : "technical_failure";
}
export const awinErrorLabels: Record<string, string> = {
  market_unconfirmed:
    "Confirme um catálogo destinado ao Brasil antes de ativar o feed. Somente registros em BRL podem ser publicados.",
  credential_pending:
    "Configure a credencial indicada no ambiente privado do backend.",
  authentication_failed:
    "Credencial recusada. Confira a credencial na Awin sem revogar outros acessos.",
  restricted:
    "O recurso remoto recusou acesso. Confira permissões e restrições; um diagnóstico HEAD recusado pela loja não comprova falha de comissão.",
  rate_limited:
    "Limite da Awin atingido. A próxima tentativa terá espera progressiva.",
  catalog_unavailable:
    "A Awin não disponibilizou catálogo neste formato/idioma.",
  incomplete_feed:
    "Download incompleto. O último catálogo válido foi preservado.",
  empty_feed: "Feed vazio inesperado. O último catálogo válido foi preservado.",
  suspicious_drop:
    "Queda de registros acima do limite configurado; catálogo anterior preservado.",
  invalid_feed:
    "Formato ou contrato do feed inválido; catálogo anterior preservado.",
  unsafe_url: "Destino recusado pela validação de segurança.",
  size_limit: "Arquivo, descompressão ou registro acima do limite.",
  record_limit:
    "Volume acima do limite configurado; catálogo anterior preservado.",
  ineligible: "Programa, links ou feed não elegíveis para publicação.",
};
