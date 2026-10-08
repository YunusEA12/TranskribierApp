import { describe, expect, it } from 'vitest';
import { dailyQuotaReset, quotaInfo } from './quota';

// Shape of a Gemini 429 as the SDK reports it (JSON of the response body).
const quota429 = (quotaId: string, retryDelay: string) =>
  JSON.stringify({
    error: {
      code: 429,
      message: 'You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-x\nPlease retry in 41.2s.',
      status: 'RESOURCE_EXHAUSTED',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId, quotaDimensions: { location: 'global', model: 'gemini-x' }, quotaValue: '20' }],
        },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
      ],
    },
  });

describe('quotaInfo', () => {
  it('recognizes an exhausted daily quota', () => {
    expect(quotaInfo(new Error(quota429('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '41s')))).toEqual({
      daily: true,
      retryAfterSec: 41,
      limit: 20,
      model: 'gemini-x',
    });
  });

  it('recognizes a per-minute quota and the suggested wait', () => {
    const info = quotaInfo(new Error(quota429('GenerateContentInputTokensPerModelPerMinute-FreeTier', '12.5s')));
    expect(info).toMatchObject({ daily: false, retryAfterSec: 13 });
  });

  it('copes with a bare message', () => {
    expect(quotaInfo(new Error('Resource has been exhausted'))).toEqual({ daily: false, retryAfterSec: undefined, limit: undefined, model: undefined });
  });
});

describe('dailyQuotaReset', () => {
  it('is the next midnight in California', () => {
    // 08:44 UTC in October is 01:44 in California (UTC-7): reset at 07:00 UTC the next day.
    expect(dailyQuotaReset(new Date('2026-10-08T08:44:00Z')).toISOString()).toBe('2026-10-09T07:00:00.000Z');
    // In winter California is UTC-8.
    expect(dailyQuotaReset(new Date('2026-12-01T20:00:00Z')).toISOString()).toBe('2026-12-02T08:00:00.000Z');
  });
});
