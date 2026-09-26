import { useState } from "react";
import { Braces, Check, CheckCheck, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { validateRules } from "../../../api/agents";
import { tenantsApi } from "../../../api/tenants";
import { AGENTS, AGENT_IDS, DEFAULT_RULES, RULE_OPTIONS } from "../../../config/platform";
import type { Tenant } from "../../../types/database";
import { useAdmin, useTenantTarget } from "../AdminContext";
import { AgentMark, EmptyState, PageHeader, SectionHeading, TenantSelect } from "../components/shared";
import { errorMessage } from "../utils";

export default function RulesPage() {
  const { target, selectTarget } = useTenantTarget();
  return <><PageHeader eyebrow="CONFIGURATION" title="Automation rules" description="Simple instructions that define how each workspace runs."/>{target ? <><div className="context-toolbar"><div className="context-picker"><TenantSelect value={target.id} onChange={selectTarget} label="CONFIGURING WORKSPACE"/></div><div className="context-note"><ShieldCheck size={15}/><span>Rules are isolated to <strong>{target.name}</strong>.</span></div></div><RuleEditor key={target.id} tenant={target}/></> : <EmptyState title="Create a tenant first" description="Each tenant has its own independent rules."/>}</>;
}

function RuleEditor({ tenant }: { tenant: Tenant }) {
  const { session, notify } = useAdmin();
  const saved = JSON.stringify(tenant.rules, null, 2);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState("");
  const [valid, setValid] = useState(false);
  const dirty = draft !== saved;
  const validate = (save = false) => {
    try {
      const rules = validateRules(JSON.parse(draft));
      setError(""); setValid(true); setDraft(JSON.stringify(rules, null, 2));
      if (save) { tenantsApi.update(session, tenant.id, { rules }); notify(`Rules saved for ${tenant.name}.`); }
    } catch (err) { setError(errorMessage(err)); setValid(false); }
  };
  return <div className="editor-layout"><section className="panel rule-editor-panel"><SectionHeading title={<><Braces size={16}/>Tenant rules</>} action={<span className="editor-state">{dirty ? "Unsaved changes" : <><Check size={11}/>Saved configuration</>}</span>}/><div className="editor-filename"><span className="mono">{tenant.slug}/automation.json</span><span>JSON</span></div><div className="rules-code-editor"><div className="code-lines" aria-hidden="true">{draft.split("\n").map((_, i) => <span key={i}>{i + 1}</span>)}</div><textarea aria-label="Automation rules JSON" spellCheck={false} value={draft} onChange={(e) => { setDraft(e.target.value); setError(""); setValid(false); }}/></div><div className="rule-editor-feedback">{error && <p className="form-error" role="alert">{error}</p>}{valid && !error && <p className="form-success"><CheckCheck size={14}/> Valid JSON. All three agent rules are recognized.</p>}</div><div className="editor-footer"><button className="text-button" onClick={() => { setDraft(JSON.stringify(DEFAULT_RULES, null, 2)); setError(""); setValid(false); }}><RotateCcw size={12}/>Restore defaults</button><div><button className="button secondary" onClick={() => validate()}><CheckCheck size={13}/>Validate</button><button className="button primary" disabled={!dirty} onClick={() => validate(true)}><Save size={13}/>Save rules</button></div></div></section><aside className="rules-guide"><div className="eyebrow">RULE REFERENCE</div><h2>Predictable by design.</h2><p>One rule per agent. No model routing, nested workflows, or external services.</p>{AGENT_IDS.map((id) => <div className="rule-reference" key={id}><div><AgentMark agent={id} size="small"/><strong>{AGENTS[id].name}</strong></div>{RULE_OPTIONS[id].map((rule) => <code key={rule}>{rule}</code>)}</div>)}<div className="rules-note"><ShieldCheck size={16}/><span>Use <code>manual</code> to stop automatic actions while keeping the agent available for an explicit test.</span></div></aside></div>;
}