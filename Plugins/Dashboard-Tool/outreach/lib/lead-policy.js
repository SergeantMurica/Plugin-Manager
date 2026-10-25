export function hasLeadActivity(lead) {
  return !!lead && (Object.values(lead.steps || {}).some((timestamp) => Number(timestamp) > 0) ||
    ["attempted", "contacted", "callback", "sold", "declined"].includes(lead.status));
}

export function belongsInLeadLog(lead) {
  return !!lead && lead.type !== "warranty" && lead.status !== "dead" && hasLeadActivity(lead);
}
