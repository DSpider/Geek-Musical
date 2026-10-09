import { ConfigurationPage } from "../Configuration.js";
export function AnalyticsParameters({ onBack }: { onBack: () => void }) {
  return (
    <>
      <button className="admin-button secondary" onClick={onBack}>
        Voltar aos dados
      </button>
      <ConfigurationPage
        namespace="analytics"
        title="Parâmetros de Analytics"
        description="Limiares das heurísticas; credenciais, propriedades e flags de coleta pertencem ao ambiente."
        fields={[
          {
            key: "analytics.autoSync",
            label: "Atualização automática dos relatórios",
            kind: "checkbox",
            help: "Importação em segundo plano quando as origens estão habilitadas no ambiente.",
          },
          {
            key: "analytics.syncIntervalHours",
            label: "Intervalo de atualização (horas)",
            kind: "number",
            min: 1,
            max: 168,
          },
          {
            key: "analytics.minImpressions",
            label: "Mínimo de impressões",
            kind: "number",
            min: 1,
            max: 1000000,
          },
          {
            key: "analytics.maxCtr",
            label: "CTR máximo para sinal de revisão",
            kind: "number",
            min: 0,
            max: 1,
            step: 0.001,
            help: "0,02 equivale a 2%.",
          },
          {
            key: "analytics.changeRatio",
            label: "Variação mínima de visibilidade",
            kind: "number",
            min: 0.01,
            max: 10,
            step: 0.01,
            help: "0,20 equivale a 20%. Exige cobertura dos dois períodos.",
          },
          {
            key: "analytics.minDays",
            label: "Dias mínimos para avaliar ausência de cliques",
            kind: "number",
            min: 7,
            max: 90,
          },
        ]}
      />
    </>
  );
}
