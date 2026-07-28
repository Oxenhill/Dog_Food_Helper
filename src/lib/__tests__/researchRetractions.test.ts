import assert from 'node:assert/strict';
import test from 'node:test';
import { checkResearchRetraction } from '../researchRetractions';

test('retraction check treats either source as sufficient', async () => {
  const fakeFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('europepmc')) {
      return new Response(JSON.stringify({
        resultList: {
          result: [{ pubTypeList: { pubType: ['Journal Article'] }, isRetracted: 'N' }],
        },
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      message: {
        items: [{
          DOI: '10.1000/retraction',
          'update-to': [{ DOI: '10.1000/original', type: 'retraction' }],
        }],
      },
    }), { status: 200 });
  };

  const result = await checkResearchRetraction('https://doi.org/10.1000/original', fakeFetch);
  assert.equal(result.europe_pmc.retracted, false);
  assert.equal(result.crossref.retracted, true);
  assert.equal(result.retracted, true);
});
