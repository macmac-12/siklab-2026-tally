export const todayManila = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const timeLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "In succession";
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T12:00:00+08:00`));
export function scheduleTimeLabel(
  schedule: Pick<
    import("@/lib/model").Schedule,
    "startsAt" | "endsAt" | "followsId"
  >,
  schedules: Pick<import("@/lib/model").Schedule, "id" | "title">[] = [],
) {
  if (schedule.startsAt)
    return `${timeLabel(schedule.startsAt)}${schedule.endsAt ? ` – ${timeLabel(schedule.endsAt)}` : ""}`;
  if (schedule.followsId)
    return `After ${schedules.find((item) => item.id === schedule.followsId)?.title || "preceding competition"}`;
  return "Time TBA";
}
export function download(name: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
