import { supabaseAdmin } from './supabase';

export type LiteratureOperationKey =
  | 'discovery_search'
  | 'citation_fetch'
  | 'doi_resolution'
  | 'metadata_enrichment'
  | 'open_access_full_text'
  | 'abstract_content';

export type LiteraturePolicyRejectionCode =
  | 'source_not_approved'
  | 'robots_disallowed'
  | 'terms_disallowed'
  | 'licence_disallowed'
  | 'paywall_or_login_required'
  | 'captcha_or_access_control'
  | 'rate_limited'
  | 'unsupported_content'
  | 'parser_failed';

export interface LiteratureSourcePolicyVersion {
  id: string;
  version: number;
  decision: 'allowed' | 'blocked';
  blocked_reason_code: LiteraturePolicyRejectionCode | null;
  access_method: 'structured_api' | 'owner_upload';
  allowed_purposes: string[];
  robots_status:
    | 'reviewed_allowed'
    | 'reviewed_disallowed'
    | 'not_applicable_structured_api';
  terms_status: 'reviewed_allowed' | 'reviewed_with_conditions' | 'reviewed_disallowed';
  licence_status:
    | 'per_record_rights_apply'
    | 'open_access_flag_and_item_licence'
    | 'owner_supplied';
  licence_policy: string;
  paywall_policy: 'reject' | 'not_applicable';
  captcha_policy: 'reject' | 'not_applicable';
  rate_limit_requests: number;
  rate_limit_window_ms: number;
  minimum_interval_ms: number;
  retry_limit: number;
  human_approval_required: boolean;
  human_approval_status: 'approved' | 'pending' | 'rejected' | 'not_required';
  effective_from: string;
  effective_until: string | null;
}

export interface LiteratureSourceVersion {
  id: string;
  source_key: string;
  authoritative_name: string;
  version: number;
  base_url: string;
  endpoint_templates: Record<string, string>;
  capabilities: string[];
  adapter_key: string;
  adapter_version: number;
  parser_key: string;
  parser_version: number;
  provenance_mapping: Record<string, unknown>;
}

export interface LiteratureSourceRoute {
  id: string;
  operation_key: LiteratureOperationKey;
  route_priority: number;
  endpoint_key: string;
  route_conditions: Record<string, unknown>;
  source: LiteratureSourceVersion;
  policy: LiteratureSourcePolicyVersion;
}

export interface LiteratureRegistrySnapshot {
  id: string;
  registry_key: string;
  version: number;
  effective_from: string;
  effective_until: string | null;
  routes: LiteratureSourceRoute[];
}

export interface LiteratureAccessContext {
  now?: Date;
  accessMethod?: 'structured_api' | 'owner_upload';
  paywallOrLoginRequired?: boolean;
  captchaOrAccessControl?: boolean;
  openAccess?: boolean;
  inPmc?: boolean;
}

export class ResearchLiteratureSourceError extends Error {
  constructor(
    readonly code: LiteraturePolicyRejectionCode,
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = 'ResearchLiteratureSourceError';
  }
}

const REJECTION_CODES = new Set<LiteraturePolicyRejectionCode>([
  'source_not_approved',
  'robots_disallowed',
  'terms_disallowed',
  'licence_disallowed',
  'paywall_or_login_required',
  'captcha_or_access_control',
  'rate_limited',
  'unsupported_content',
  'parser_failed',
]);

function rejectionCode(value: unknown): LiteraturePolicyRejectionCode {
  return typeof value === 'string' && REJECTION_CODES.has(value as LiteraturePolicyRejectionCode)
    ? value as LiteraturePolicyRejectionCode
    : 'source_not_approved';
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objectValue(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function evaluateLiteratureSourcePolicy(
  operationKey: LiteratureOperationKey,
  policy: LiteratureSourcePolicyVersion,
  context: LiteratureAccessContext = {}
): { allowed: true } | { allowed: false; code: LiteraturePolicyRejectionCode; reason: string } {
  const now = context.now ?? new Date();
  if (policy.decision !== 'allowed') {
    return {
      allowed: false,
      code: policy.blocked_reason_code ?? 'source_not_approved',
      reason: 'the pinned source-policy version is blocked',
    };
  }
  if (now < new Date(policy.effective_from) || (
    policy.effective_until && now >= new Date(policy.effective_until)
  )) {
    return { allowed: false, code: 'source_not_approved', reason: 'policy is not effective' };
  }
  if (
    policy.human_approval_required &&
    policy.human_approval_status !== 'approved'
  ) {
    return { allowed: false, code: 'source_not_approved', reason: 'human approval is absent' };
  }
  if (!policy.allowed_purposes.includes(operationKey)) {
    return { allowed: false, code: 'source_not_approved', reason: 'purpose is not approved' };
  }
  if (policy.access_method !== (context.accessMethod ?? 'structured_api')) {
    return { allowed: false, code: 'source_not_approved', reason: 'access method does not match' };
  }
  if (policy.robots_status === 'reviewed_disallowed') {
    return { allowed: false, code: 'robots_disallowed', reason: 'robots policy disallows access' };
  }
  if (policy.terms_status === 'reviewed_disallowed') {
    return { allowed: false, code: 'terms_disallowed', reason: 'Terms disallow access' };
  }
  if (context.paywallOrLoginRequired) {
    return {
      allowed: false,
      code: 'paywall_or_login_required',
      reason: 'no paywall or login bypass is permitted',
    };
  }
  if (context.captchaOrAccessControl) {
    return {
      allowed: false,
      code: 'captcha_or_access_control',
      reason: 'no CAPTCHA or access-control bypass is permitted',
    };
  }
  if (
    operationKey === 'open_access_full_text' &&
    policy.licence_status === 'open_access_flag_and_item_licence' &&
    (!context.openAccess || !context.inPmc)
  ) {
    return {
      allowed: false,
      code: 'licence_disallowed',
      reason: 'the item is not marked open access and in PMC',
    };
  }
  return { allowed: true };
}

export function resolveLiteratureSourceRoute(
  snapshot: LiteratureRegistrySnapshot,
  operationKey: LiteratureOperationKey,
  context: LiteratureAccessContext = {}
): LiteratureSourceRoute {
  const routes = snapshot.routes
    .filter((route) => route.operation_key === operationKey)
    .sort((left, right) => left.route_priority - right.route_priority);
  if (routes.length === 0) {
    throw new ResearchLiteratureSourceError(
      'unsupported_content',
      `the pinned registry has no route for ${operationKey}`
    );
  }
  let firstRejection:
    | { code: LiteraturePolicyRejectionCode; reason: string }
    | undefined;
  for (const route of routes) {
    const decision = evaluateLiteratureSourcePolicy(operationKey, route.policy, context);
    if (decision.allowed) return route;
    firstRejection ??= decision;
  }
  throw new ResearchLiteratureSourceError(
    firstRejection?.code ?? 'source_not_approved',
    firstRejection?.reason ?? `no approved route exists for ${operationKey}`
  );
}

export function literatureEndpoint(
  route: LiteratureSourceRoute,
  pathParameters: Record<string, string> = {}
): string {
  const template = route.source.endpoint_templates[route.endpoint_key];
  if (!template) {
    throw new ResearchLiteratureSourceError(
      'unsupported_content',
      `endpoint ${route.endpoint_key} is absent from the pinned source version`
    );
  }
  const path = template.replace(/\{([a-z][a-z0-9_]*)\}/g, (_match, key: string) => {
    const value = pathParameters[key];
    if (!value) {
      throw new ResearchLiteratureSourceError(
        'unsupported_content',
        `endpoint parameter ${key} is required`
      );
    }
    return encodeURIComponent(value);
  });
  if (/\{[^}]+\}/.test(path)) {
    throw new ResearchLiteratureSourceError('unsupported_content', 'endpoint is unresolved');
  }
  return `${route.source.base_url}${path}`;
}

export function createLiteratureRateGate(minimumIntervalMs: number) {
  let nextAllowedAt = 0;
  return async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextAllowedAt - now);
    nextAllowedAt = Math.max(now, nextAllowedAt) + Math.max(0, minimumIntervalMs);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  };
}

export async function loadLiteratureRegistrySnapshot(
  registryVersionId: string
): Promise<LiteratureRegistrySnapshot> {
  const { data: registry, error: registryError } = await supabaseAdmin
    .from('research_literature_registry_versions')
    .select('*')
    .eq('id', registryVersionId)
    .maybeSingle();
  if (registryError || !registry) {
    throw registryError ?? new Error('Pinned literature registry was not found');
  }
  const { data: sourceVersions, error: sourceVersionError } = await supabaseAdmin
    .from('research_literature_source_versions')
    .select('*')
    .eq('registry_version_id', registryVersionId);
  if (sourceVersionError) throw sourceVersionError;
  const sourceVersionRows = sourceVersions ?? [];
  const sourceIds = sourceVersionRows.map((row) => row.source_id);
  const sourceVersionIds = sourceVersionRows.map((row) => row.id);
  const [sourcesResult, policiesResult, routesResult] = await Promise.all([
    sourceIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin.from('research_literature_sources').select('*').in('id', sourceIds),
    sourceVersionIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin
          .from('research_literature_source_policy_versions')
          .select('*')
          .in('source_version_id', sourceVersionIds),
    supabaseAdmin
      .from('research_literature_source_routes')
      .select('*')
      .eq('registry_version_id', registryVersionId)
      .order('operation_key', { ascending: true })
      .order('route_priority', { ascending: true }),
  ]);
  if (sourcesResult.error) throw sourcesResult.error;
  if (policiesResult.error) throw policiesResult.error;
  if (routesResult.error) throw routesResult.error;

  const sourceById = new Map((sourcesResult.data ?? []).map((source) => [source.id, source]));
  const sourceVersionById = new Map(sourceVersionRows.map((source) => [source.id, source]));
  const policyById = new Map((policiesResult.data ?? []).map((policy) => [policy.id, policy]));
  const routes: LiteratureSourceRoute[] = (routesResult.data ?? []).map((route) => {
    const sourceVersion = sourceVersionById.get(route.source_version_id);
    const source = sourceVersion ? sourceById.get(sourceVersion.source_id) : null;
    const policy = policyById.get(route.source_policy_version_id);
    if (!sourceVersion || !source || !policy) {
      throw new Error('Pinned literature registry contains a broken route reference');
    }
    return {
      id: route.id,
      operation_key: route.operation_key as LiteratureOperationKey,
      route_priority: route.route_priority,
      endpoint_key: route.endpoint_key,
      route_conditions: objectValue(route.route_conditions),
      source: {
        id: sourceVersion.id,
        source_key: source.source_key,
        authoritative_name: source.authoritative_name,
        version: sourceVersion.version,
        base_url: sourceVersion.base_url,
        endpoint_templates: stringMap(sourceVersion.endpoint_templates),
        capabilities: stringArray(sourceVersion.capabilities),
        adapter_key: sourceVersion.adapter_key,
        adapter_version: sourceVersion.adapter_version,
        parser_key: sourceVersion.parser_key,
        parser_version: sourceVersion.parser_version,
        provenance_mapping: objectValue(sourceVersion.provenance_mapping),
      },
      policy: {
        id: policy.id,
        version: policy.version,
        decision: policy.decision,
        blocked_reason_code: policy.blocked_reason_code
          ? rejectionCode(policy.blocked_reason_code)
          : null,
        access_method: policy.access_method,
        allowed_purposes: stringArray(policy.allowed_purposes),
        robots_status: policy.robots_status,
        terms_status: policy.terms_status,
        licence_status: policy.licence_status,
        licence_policy: policy.licence_policy,
        paywall_policy: policy.paywall_policy,
        captcha_policy: policy.captcha_policy,
        rate_limit_requests: policy.rate_limit_requests,
        rate_limit_window_ms: policy.rate_limit_window_ms,
        minimum_interval_ms: policy.minimum_interval_ms,
        retry_limit: policy.retry_limit,
        human_approval_required: policy.human_approval_required,
        human_approval_status: policy.human_approval_status,
        effective_from: policy.effective_from,
        effective_until: policy.effective_until,
      },
    };
  });
  return {
    id: registry.id,
    registry_key: registry.registry_key,
    version: registry.version,
    effective_from: registry.effective_from,
    effective_until: registry.effective_until,
    routes,
  };
}

const ALLOWED_POLICY: LiteratureSourcePolicyVersion = {
  id: 'local-policy-v1',
  version: 1,
  decision: 'allowed',
  blocked_reason_code: null,
  access_method: 'structured_api',
  allowed_purposes: [
    'discovery_search',
    'citation_fetch',
    'doi_resolution',
    'metadata_enrichment',
    'open_access_full_text',
    'abstract_content',
  ],
  robots_status: 'not_applicable_structured_api',
  terms_status: 'reviewed_with_conditions',
  licence_status: 'per_record_rights_apply',
  licence_policy: 'Per-record rights apply.',
  paywall_policy: 'reject',
  captcha_policy: 'reject',
  rate_limit_requests: 3,
  rate_limit_window_ms: 1000,
  minimum_interval_ms: 500,
  retry_limit: 5,
  human_approval_required: true,
  human_approval_status: 'approved',
  effective_from: '2026-08-01T00:00:00.000Z',
  effective_until: null,
};

/** Test/offline mirror of migration version 1. Production mission paths load by pinned DB ID. */
export const LOCAL_LITERATURE_REGISTRY_V1: LiteratureRegistrySnapshot = {
  id: 'local-bowl-structured-literature-v1',
  registry_key: 'bowl_structured_literature',
  version: 1,
  effective_from: '2026-08-01T00:00:00.000Z',
  effective_until: null,
  routes: [
    ['discovery_search', 'pubmed', 'https://eutils.ncbi.nlm.nih.gov', '/entrez/eutils/esearch.fcgi'],
    ['citation_fetch', 'pubmed', 'https://eutils.ncbi.nlm.nih.gov', '/entrez/eutils/efetch.fcgi'],
    ['doi_resolution', 'pubmed', 'https://eutils.ncbi.nlm.nih.gov', '/entrez/eutils/esearch.fcgi'],
    ['abstract_content', 'pubmed', 'https://eutils.ncbi.nlm.nih.gov', '/entrez/eutils/efetch.fcgi'],
    ['metadata_enrichment', 'europe_pmc', 'https://www.ebi.ac.uk/europepmc/webservices/rest', '/search'],
    ['open_access_full_text', 'europe_pmc', 'https://www.ebi.ac.uk/europepmc/webservices/rest', '/{pmcid}/fullTextXML'],
  ].map(([operation, sourceKey, baseUrl, endpoint], index) => ({
    id: `local-route-${index + 1}`,
    operation_key: operation as LiteratureOperationKey,
    route_priority: 1,
    endpoint_key: operation,
    route_conditions: operation === 'open_access_full_text'
      ? { open_access: true, in_pmc: true }
      : {},
    source: {
      id: `local-source-${sourceKey}-v1`,
      source_key: sourceKey,
      authoritative_name: sourceKey === 'pubmed'
        ? 'PubMed / NCBI Entrez E-utilities'
        : 'Europe PMC RESTful Web Service',
      version: 1,
      base_url: baseUrl,
      endpoint_templates: { [operation]: endpoint },
      capabilities: [operation],
      adapter_key: sourceKey === 'pubmed' ? 'pubmed_eutils' : 'europe_pmc_rest',
      adapter_version: 1,
      parser_key: sourceKey === 'pubmed' ? 'nlm_pubmed_xml' : 'europe_pmc_jats',
      parser_version: 1,
      provenance_mapping: {},
    },
    policy: {
      ...ALLOWED_POLICY,
      id: `local-policy-${sourceKey}-v1`,
      minimum_interval_ms: sourceKey === 'pubmed' ? 500 : 350,
      licence_status: sourceKey === 'pubmed'
        ? 'per_record_rights_apply'
        : 'open_access_flag_and_item_licence',
    },
  })),
};
