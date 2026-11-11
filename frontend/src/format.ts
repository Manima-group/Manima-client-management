const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function inr(n: number | null | undefined): string {
  return "₹" + Math.round(n || 0).toLocaleString("en-IN");
}

/** Document style used on Manima quotations: Rs. 35,000/- */
export function rs(n: number | null | undefined): string {
  return "Rs. " + Math.round(n || 0).toLocaleString("en-IN") + "/-";
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return isNaN(d.getTime()) ? null : d;
}

export function longDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
}

export function shortDate(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : "—";
}

export function dayMonth(iso: string | null | undefined): { mon: string; day: string } {
  const d = parseDate(iso);
  return d ? { mon: MONTHS[d.getMonth()].slice(0, 3).toUpperCase(), day: String(d.getDate()) } : { mon: "", day: "" };
}

export function timeOf(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d || iso!.length === 10) return "";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toUpperCase();
}

export function weekday(iso: string | null | undefined): string {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString("en-IN", { weekday: "short" }) : "";
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso) || new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Status → pill tone, matching the final UI. */
export function tone(status: string): string {
  switch (status) {
    case "overdue":
    case "rejected":
    case "lost":
    case "cancelled":
      return "pink";
    case "paid":
    case "completed":
    case "approved":
    case "won":
      return "yellow";
    case "ongoing":
    case "confirmed":
    case "sent":
    case "quote sent":
    case "active":
    case "proposal":
    case "contacted":
      return "orange";
    default:
      return "grey";
  }
}

export function label(status: string): string {
  const map: Record<string, string> = {
    excl: "GST extra", add: "GST added", none: "No GST", per_head: "Per head", per_day: "Per day", fixed: "Fixed fee",
    on_hold: "On hold",
  };
  return map[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

export function fill(text: string, client: string): string {
  return (text || "").split("{client}").join(client);
}
