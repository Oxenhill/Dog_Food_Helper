import { matchClaimSubject } from '../src/lib/activeClaimRetrieval';
import { fetchFoodFullMany } from '../src/lib/foodFull';
import { supabaseAdmin } from '../src/lib/supabase';

/**
 * The project's PostgREST max-rows setting silently truncates a plain
 * .select() past its cap (confirmed 1215 real rows in research_chunks vs.
 * a first attempt at this script reading back exactly 1000) -- paginate
 * explicitly rather than trust an unbounded .select() on any table that
 * could plausibly exceed it.
 */
async function fetchAllRows<T>(
  table: string,
  columns: string,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/**
 * Read-only audit, no writes. Checks two different things that "approved
 * research landed properly" can silently fail on:
 *
 * 1. Structural integrity -- does every active cluster/claim actually link
 *    up (member claims exist, are active, chunk quotes still match)?
 * 2. Real-world usability -- activeClaimRetrieval.ts matches a claim's
 *    subject to a food by exact canonical ingredient/nutrient/class/
 *    processing-method name. A claim can be perfectly well-formed and
 *    approved and still never attach to any recommendation today if no
 *    food in the current catalog actually has a matching ingredient.
 */

interface ClaimRow {
  id: string;
  document_id: string;
  chunk_id: string;
  subject_type: 'ingredient' | 'nutrient' | 'ingredient_class' | 'processing_method' | 'biome_marker';
  subject_value: string;
  direction: string;
  status: string;
  supporting_quote: string;
}
interface ClusterRow { id: string; status: string; subject_type: string; subject_value: string }
interface MemberRow { cluster_id: string; claim_id: string }
interface DocumentRow { id: string; title: string | null }
interface ChunkRow { id: string; content: string }
interface FoodIdRow { id: string }

async function main(): Promise<void> {
  const [{ data: settings, error: settingsError }] = await Promise.all([
    supabaseAdmin.from('recommendation_scoring_weights').select('*').eq('active', true).maybeSingle(),
  ]);
  if (settingsError) throw settingsError;

  const [claims, clusters, members, documents, chunks, foodRows] = await Promise.all([
    fetchAllRows<ClaimRow>(
      'research_claims',
      'id, document_id, chunk_id, subject_type, subject_value, direction, status, supporting_quote'
    ).then((rows) => rows.filter((row) => row.status === 'active')),
    fetchAllRows<ClusterRow>('research_evidence_clusters', 'id, status, subject_type, subject_value'),
    fetchAllRows<MemberRow>('research_evidence_cluster_members', 'cluster_id, claim_id'),
    fetchAllRows<DocumentRow>('research_documents', 'id, title'),
    fetchAllRows<ChunkRow>('research_chunks', 'id, content'),
    fetchAllRows<FoodIdRow>('foods', 'id'),
  ]);

  process.stdout.write('=== Master switch ===\n');
  process.stdout.write(
    `research_scoring_enabled: ${settings?.research_scoring_enabled ?? 'no active row found'}\n\n`
  );

  process.stdout.write('=== Structural integrity ===\n');
  const claimById = new Map((claims ?? []).map((c) => [c.id, c]));
  const documentById = new Map((documents ?? []).map((d) => [d.id, d]));
  const chunkById = new Map((chunks ?? []).map((c) => [c.id, c]));
  const activeClusters = (clusters ?? []).filter((c) => c.status === 'active');
  const membersByCluster = new Map<string, string[]>();
  for (const member of members ?? []) {
    const list = membersByCluster.get(member.cluster_id) ?? [];
    list.push(member.claim_id);
    membersByCluster.set(member.cluster_id, list);
  }

  let clustersWithNoMembers = 0;
  let clustersWithInactiveMember = 0;
  let claimsWithMissingDocument = 0;
  let claimsWithMissingChunk = 0;
  let claimsWithDriftedQuote = 0;

  for (const cluster of activeClusters) {
    const memberClaimIds = membersByCluster.get(cluster.id) ?? [];
    if (memberClaimIds.length === 0) clustersWithNoMembers += 1;
    for (const claimId of memberClaimIds) {
      const claim = claimById.get(claimId);
      if (!claim || claim.status !== 'active') clustersWithInactiveMember += 1;
    }
  }
  for (const claim of claims ?? []) {
    const document = documentById.get(claim.document_id);
    if (!document) claimsWithMissingDocument += 1;
    const chunk = chunkById.get(claim.chunk_id);
    if (!chunk) claimsWithMissingChunk += 1;
    else if (!chunk.content.includes(claim.supporting_quote)) claimsWithDriftedQuote += 1;
  }

  process.stdout.write(`Active clusters: ${activeClusters.length}\n`);
  process.stdout.write(`Active claims: ${(claims ?? []).length}\n`);
  process.stdout.write(`Clusters with zero member claims: ${clustersWithNoMembers}\n`);
  process.stdout.write(`Clusters referencing a non-active/missing claim: ${clustersWithInactiveMember}\n`);
  process.stdout.write(`Claims with a missing source document: ${claimsWithMissingDocument}\n`);
  process.stdout.write(`Claims with a missing source chunk: ${claimsWithMissingChunk}\n`);
  process.stdout.write(`Claims whose quote no longer matches the chunk verbatim: ${claimsWithDriftedQuote}\n\n`);

  process.stdout.write('=== Real-world usability (can this claim attach to any food today?) ===\n');
  const allFoodIds = (foodRows ?? []).map((row) => row.id as string);
  const foods = await fetchFoodFullMany(allFoodIds);
  const foodList = Array.from(foods.values());
  process.stdout.write(`Foods in catalog checked against: ${foodList.length}\n\n`);

  let matchable = 0;
  let unsupportedSubjectType = 0;
  let supportedButNoFoodMatches = 0;
  const orphaned: Array<{ title: string; subject_type: string; subject_value: string; direction: string }> = [];

  for (const claim of claims ?? []) {
    let supported = false;
    let anyMatch = false;
    for (const food of foodList) {
      const result = matchClaimSubject(claim.subject_type, claim.subject_value, food);
      supported = result.supported;
      if (result.matches) {
        anyMatch = true;
        break;
      }
    }
    if (!supported) {
      unsupportedSubjectType += 1;
      orphaned.push({
        title: documentById.get(claim.document_id)?.title ?? claim.document_id,
        subject_type: claim.subject_type,
        subject_value: claim.subject_value,
        direction: claim.direction,
      });
    } else if (anyMatch) {
      matchable += 1;
    } else {
      supportedButNoFoodMatches += 1;
      orphaned.push({
        title: documentById.get(claim.document_id)?.title ?? claim.document_id,
        subject_type: claim.subject_type,
        subject_value: claim.subject_value,
        direction: claim.direction,
      });
    }
  }

  process.stdout.write(`Claims that match at least one real food today: ${matchable}\n`);
  process.stdout.write(
    `Claims with a recognized subject but no matching food in the catalog yet: ${supportedButNoFoodMatches}\n`
  );
  process.stdout.write(`Claims with an unsupported subject_type/value (should be 0 -- draft-time validation should have caught this): ${unsupportedSubjectType}\n\n`);

  if (orphaned.length > 0) {
    process.stdout.write('=== Orphaned claims (approved, but currently unattachable to any food) ===\n');
    for (const item of orphaned) {
      process.stdout.write(`- [${item.subject_type}] "${item.subject_value}" (${item.direction}) -- ${item.title}\n`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
