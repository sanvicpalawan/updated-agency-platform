import { eventsApi } from "../../../api/events";
import { messagesApi } from "../../../api/messages";
import { AGENTS } from "../../../config/platform";
import { useAdmin } from "../AdminContext";
import { fullDate } from "../utils";
import { EmptyState } from "./shared";

export function RecordTimeline({ tenant_id, id, kind }: { tenant_id: string; id: string; kind: "lead" | "booking" }) {
  const { session } = useAdmin();
  const events = eventsApi.list(session, tenant_id, id);
  const messages = kind === "lead" ? messagesApi.list(session, tenant_id, id) : [];
  return <><div className="code-heading">{kind === "lead" ? "LEAD HISTORY" : "BOOKING TIMELINE"}<span>{events.length} events</span></div>{events.length ? <ol className="timeline">{events.map((event) => <li key={event.id}><i/><div><p>{event.message}</p><small>{fullDate(event.created_at)} / {event.agent ? AGENTS[event.agent].name : "Administrator"}</small>{event.payload.previous !== undefined && <small>{String(event.payload.previous)} to {String(event.payload.status ?? event.payload.assigned_agent)}</small>}</div></li>)}</ol> : <EmptyState title="No history yet" description="Changes to this record will appear here."/>}{messages.length > 0 && <><div className="code-heading">MOCK OUTBOX<span>{messages.length} messages</span></div>{messages.slice(0, 5).map((message) => <div className="timeline-message" key={message.id}><div className="outbox-meta"><span>{AGENTS[message.agent].name} / {message.channel}</span><span>{fullDate(message.created_at)}</span></div><p>{message.content}</p></div>)}<p className="page-footnote">Messages are stored locally. No email or messaging provider is connected.</p></>}</>;
}