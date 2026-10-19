const sections = [
  "readers",
  "memberships",
  "profile-reviews",
  "maintenance",
  "activity",
] as const;
export type AdminConsoleSection = (typeof sections)[number];
const isSection = (value: string): value is AdminConsoleSection =>
  sections.some((section) => section === value);

/** Keep only a section name: never persist search terms, account IDs or arbitrary URLs. */
export function consoleSection(route: string): AdminConsoleSection {
  const path = route.replace(/^#/, "").split("?")[0];
  const section = path.startsWith("/") ? path.slice(1) : path;
  return isSection(section) ? section : "readers";
}

export function adminConsoleHref(section: string = "readers"): string {
  return "/admin-console/#/" + consoleSection(section);
}

export function adminLoginHref(route: string): string {
  return "/?adminReturn=" + consoleSection(route) + "#/account";
}

export function adminReturnDestination(
  search: string,
  authenticatedOwner: boolean,
): string | null {
  if (!authenticatedOwner) return null;
  const section = requestedSection(search);
  return section ? adminConsoleHref(section) : null;
}

function requestedSection(search: string): AdminConsoleSection | null {
  const values = new URLSearchParams(search).getAll("adminReturn");
  return values.length === 1 && isSection(values[0]) ? values[0] : null;
}

/** A reader signing in at an admin entrance keeps their existing account UI. */
export function readerAdminReturnLocation(search: string): string | null {
  if (!requestedSection(search)) return null;
  const params = new URLSearchParams(search);
  params.delete("adminReturn");
  return "/" + (params.size ? "?" + params.toString() : "") + "#/account";
}
