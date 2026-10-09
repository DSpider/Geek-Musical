import { useState } from "react";
import type { WeeklyAuditSnapshot } from "../../../../shared/seo-audit.js";
import { api } from "../../api.js";
import { usePermission } from "../../context.js";
import { Notice, Panel, useLoad } from "../../components.js";
export function WeeklyAudit() {
  const canManage = usePermission("analytics.manage");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const { data, error } = useLoad<{
    snapshot: WeeklyAuditSnapshot | null;
    readStatus: string;
    paused: boolean;
    requestedAt: string;
    revision: string;
    executor: string;
  }>("/analytics/weekly-audit", refresh);
  async function update(values: Record<string, boolean | string>) {
    if (!data || busy) return;
    setBusy(true);
    setActionError("");
    try {
      await api("/analytics", {
        method: "PUT",
        body: { revision: data.revision, values },
      });
      setRefresh((v) => v + 1);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Não foi possível registrar o pedido.",
      );
    } finally {
      setBusy(false);
    }
  }
  const snapshot = data?.snapshot;
  return (
    <Panel title="Auditoria e Otimização de SEO">
      <Notice error={error || actionError} />
      {snapshot ? (
        <>
          <p>
            Última execução:{" "}
            {new Date(snapshot.finishedAt).toLocaleString("pt-BR")} —{" "}
            {snapshot.status}. Produção: {snapshot.origin}.
          </p>
          <p>
            Cobertura: {snapshot.coverage.analyzed}/{snapshot.coverage.known}{" "}
            URLs e {snapshot.coverage.editorialAnalyzed}/
            {snapshot.coverage.editorialKnown} artigos;{" "}
            {snapshot.coverage.blocked} bloqueadas e {snapshot.coverage.pending}{" "}
            pendentes.
          </p>
          <p>
            Alterações publicadas: {snapshot.publishedChanges}. Testes
            aprovados: {snapshot.testsPassed}; falhas: {snapshot.testsFailed}.
            Achados pendentes: P0 {snapshot.findings.P0}, P1{" "}
            {snapshot.findings.P1}, P2 {snapshot.findings.P2}, P3{" "}
            {snapshot.findings.P3}. Resolvidos: {snapshot.findings.resolved}.
          </p>
          <p>
            Consumo: {snapshot.googleRequests} requisições Google;{" "}
            {snapshot.paidApiCalls} chamadas pagas. Revisão:{" "}
            <code>{snapshot.revision.slice(0, 12)}</code>.
          </p>
          <details>
            <summary>Histórico recente</summary>
            <ul>
              {snapshot.history.map((run) => (
                <li key={run.runId}>
                  {new Date(run.finishedAt).toLocaleDateString("pt-BR")}:{" "}
                  {run.status}, {run.publishedChanges} alterações publicadas
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p>
          Relatório privado {data?.readStatus || "carregando"}. Ausência de
          relatório não confirma a saúde do site.
        </p>
      )}
      {data && (
        <>
          <p>
            Rotina {data.paused ? "pausada" : "liberada"}. {data.executor}
          </p>
          {data.requestedAt && (
            <p>
              Último pedido manual:{" "}
              {new Date(data.requestedAt).toLocaleString("pt-BR")}.
            </p>
          )}
        </>
      )}
      {canManage && data && (
        <div className="admin-toolbar">
          <button
            className="admin-button secondary"
            disabled={busy}
            onClick={() => update({ "analytics.auditPaused": !data.paused })}
          >
            {data.paused ? "Retomar rotina" : "Pausar rotina"}
          </button>
          <button
            className="admin-button secondary"
            disabled={busy || data.paused}
            onClick={() =>
              update({ "analytics.auditRequestedAt": new Date().toISOString() })
            }
          >
            Solicitar execução manual
          </button>
        </div>
      )}
      <p className="admin-help">
        O relatório completo permanece no armazenamento privado do executor.
        Pausa e pedidos usam as permissões, CSRF e revisões deste painel. Uma
        solicitação não confirma início, publicação ou resultado orgânico.
      </p>
    </Panel>
  );
}
