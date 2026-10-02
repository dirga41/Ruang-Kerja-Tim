/** Menentukan penyedia model dari environment server. Dipakai oleh /api/claude dan /api/health. */
export interface Provider {
  kind: 'anthropic' | 'openai';
  key: string;
  baseUrl: string;
  model: string;
}

export function resolveProvider(env: Record<string, string | undefined>): Provider | null {
  if (env.DEMO_MODE === 'true') return null;
  const anthropic = (env.ANTHROPIC_API_KEY ?? '').trim();
  const openai = (env.OPENAI_API_KEY ?? '').trim();
  const want = (env.LLM_PROVIDER ?? '').trim().toLowerCase();
  const kind = want === 'openai' || want === 'anthropic' ? want : openai && !anthropic ? 'openai' : 'anthropic';
  if (kind === 'openai') {
    if (!openai) return null;
    return {
      kind, key: openai,
      baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: env.OPENAI_MODEL || 'gpt-4o',
    };
  }
  if (!anthropic) return null;
  return {
    kind: 'anthropic', key: anthropic,
    baseUrl: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
    model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  };
}
