import { createOpenAPI } from 'fumadocs-openapi/server';
import specFallback from '../content/api-reference/openapi.json';

type SpecDoc = Record<string, unknown>;

// Maps raw tag names → sidebar display names. Covers both the committed snapshot
// (clean hyphenated tags) and the live FastAPI spec ("user management" with space).
const TAG_DISPLAY_NAMES: Record<string, string> = {
  auth: 'Authentication',
  'user management': 'User Management',
  'user-management': 'User Management',
  callings: 'Callings',
  assignments: 'HC Assignments',
  'high-council': 'High Council',
  'calling-kanban': 'Calling Tracker',
  speaking: 'Speaking Schedule',
  ward: 'Wards',
  health: 'Health',
  presidency: 'Presidency',
  'temple-config': 'Temple Config',
  'appointment-types': 'Appointment Types',
  'appointment-availability': 'Availability',
  'appointment-bookings': 'Appointments',
  reservations: 'Reservations',
  settings: 'Settings',
};

function injectMetadata(base: SpecDoc): SpecDoc {
  const spec = structuredClone(base) as SpecDoc;

  spec.servers = [
    { url: 'https://api.yourstake.org', description: 'Production' },
    { url: 'http://localhost:8000', description: 'Development' },
  ];

  // Collect all tag names actually used in the spec's operations.
  const usedTags = new Set<string>();
  if (spec.paths && typeof spec.paths === 'object') {
    for (const pathItem of Object.values(spec.paths as Record<string, unknown>)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      for (const op of Object.values(pathItem as Record<string, unknown>)) {
        if (op && typeof op === 'object' && 'tags' in op && Array.isArray((op as Record<string, unknown>).tags)) {
          for (const t of (op as { tags: string[] }).tags) usedTags.add(t);
        }
      }
    }
  }

  // Merge x-displayName into any existing top-level tag entries; add missing ones.
  const existingTags = Array.isArray(spec.tags)
    ? (spec.tags as Array<Record<string, unknown>>)
    : [];

  const existingByName = new Map(existingTags.map((t) => [t.name as string, t]));

  for (const tagName of usedTags) {
    const displayName = TAG_DISPLAY_NAMES[tagName] ?? tagName;
    const entry = existingByName.get(tagName);
    if (entry) {
      entry['x-displayName'] = displayName;
    } else {
      existingByName.set(tagName, { name: tagName, 'x-displayName': displayName });
    }
  }

  spec.tags = [...existingByName.values()];

  return spec;
}

export const openapi = createOpenAPI({
  input: {
    api: async () => {
      try {
        const res = await fetch('http://localhost:8000/openapi.json', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return injectMetadata((await res.json()) as SpecDoc);
      } catch {
        // Fall back to committed snapshot when backend is not running.
        return injectMetadata(specFallback as unknown as SpecDoc);
      }
    },
  },
});
